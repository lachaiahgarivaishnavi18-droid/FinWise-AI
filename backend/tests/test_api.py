import pytest
from datetime import date, timedelta
from backend.app import create_app
from backend.models import db, ExpenseCategory, UserMemory, MemoryEmbedding, Message, now
from backend.services import CATEGORIES


@pytest.fixture
def client():
    app = create_app({'TESTING':True,'SQLALCHEMY_DATABASE_URI':'sqlite://','JWT_SECRET_KEY':'test-only-secret-at-least-32-characters'})
    with app.app_context():
        db.create_all()
        db.session.add_all(ExpenseCategory(name=n) for n in CATEGORIES)
        db.session.commit()
    with app.test_client() as c:
        yield c


def register(c,email='alex@example.com'):
    r=c.post('/api/auth/register',json={'name':'Alex','email':email,'password':'a long secure password'})
    assert r.status_code==201,r.json
    return {'Authorization':'Bearer '+r.json['token']}


def transaction(c,h,kind='expense',amount='100.15',**kwargs):
    return c.post('/api/transactions',headers=h,json={'kind':kind,'description':'Groceries','amount':amount,'category_id':2,'date':date.today().isoformat(),**kwargs})


def test_auth_logout_revokes_token(client):
    h=register(client)
    assert client.get('/api/profile').status_code==401
    assert client.post('/api/auth/login',json={'email':'alex@example.com','password':'wrong'}).status_code==401
    assert client.post('/api/auth/logout',headers=h).status_code==200
    assert client.get('/api/profile',headers=h).status_code==401


def test_exact_financial_calculations_and_crud(client):
    h=register(client)
    assert transaction(client,h,'income','1000.10').status_code==201
    expense=transaction(client,h,amount='200.05').json
    assert transaction(client,h,amount='0.05').status_code==201
    s=client.get('/api/dashboard',headers=h).json
    assert s['income']==1000.1 and s['expenses']==200.1 and s['savings']==800.0
    assert s['savings_rate']==80.0
    assert client.patch(f'/api/transactions/expense/{expense["id"]}',headers=h,json={'amount':'250.05'}).status_code==200
    assert client.get('/api/transactions?min=200&category=2',headers=h).json[0]['amount']==250.05
    assert client.delete(f'/api/transactions/expense/{expense["id"]}',headers=h).status_code==200
    assert client.get('/api/dashboard',headers=h).json['expenses']==.05


@pytest.mark.parametrize('amount',['-1','NaN','Infinity','0','oops',None,'1000000000000'])
def test_invalid_money_rejected(client,amount):
    h=register(client)
    assert transaction(client,h,amount=amount).status_code==400


def test_account_isolation(client):
    a=register(client)
    t=transaction(client,a).json
    g=client.post('/api/goals',headers=a,json={'name':'Emergency fund','target_amount':1000,'target_date':(date.today()+timedelta(days=100)).isoformat()}).json
    m=client.post('/api/memories',headers=a,json={'content':'I prefer saving 20 percent','consent':True}).json
    b=register(client,'other@example.com')
    assert client.get('/api/transactions',headers=b).json==[]
    assert client.get('/api/goals',headers=b).json==[]
    assert client.get('/api/memories',headers=b).json==[]
    assert client.patch(f'/api/transactions/expense/{t["id"]}',headers=b,json={'amount':200}).status_code==404
    assert client.post(f'/api/goals/{g["id"]}/contributions',headers=b,json={'amount':100}).status_code==404
    assert client.delete(f'/api/memories/{m["id"]}',headers=b).status_code==404


def test_memory_requires_consent_excludes_secrets_and_deduplicates(client):
    h=register(client)
    assert client.post('/api/memories',headers=h,json={'content':'I like saving'}).status_code==400
    assert client.post('/api/memories',headers=h,json={'content':'My password is hidden','consent':True}).status_code==400
    m=client.post('/api/memories',headers=h,json={'content':'I prefer saving 20 percent','consent':True}).json
    assert client.post('/api/memories',headers=h,json={'content':m['content'],'consent':True}).status_code==409
    assert client.patch(f'/api/memories/{m["id"]}',headers=h,json={'content':'changed'}).status_code==400
    assert client.patch(f'/api/memories/{m["id"]}',headers=h,json={'content':'I prefer saving 25 percent','consent':True}).status_code==200
    assert client.delete(f'/api/memories/{m["id"]}',headers=h).status_code==200
    assert client.get('/api/memories',headers=h).json==[]


def test_stale_memories_never_retrieved_and_pause_honored(client):
    h=register(client)
    m=client.post('/api/memories',headers=h,json={'content':'I prefer saving 20 percent','consent':True}).json
    assert client.post('/api/chat',headers=h,json={'message':'How much am I saving?'}).json['memory_ids']==[m['id']]
    with client.application.app_context():
        mem=db.session.get(UserMemory,m['id'])
        mem.expires_at=now()-timedelta(days=1)
        db.session.commit()
    assert client.post('/api/chat',headers=h,json={'message':'How much am I saving?'}).json['memory_ids']==[]
    client.patch('/api/settings',headers=h,json={'memory_enabled':False})
    assert client.post('/api/memories',headers=h,json={'content':'New memory','consent':True}).status_code==400
    assert client.post('/api/chat',headers=h,json={'message':'saving'}).json['retrieval']=='disabled'


def test_chat_history_opt_in_and_deletion(client):
    h=register(client)
    r=client.post('/api/chat',headers=h,json={'message':'Remember that I prefer saving 20 percent'})
    assert r.json['memory_candidate']
    assert client.get('/api/memories',headers=h).json==[]
    assert client.get('/api/chat',headers=h).json==[]
    client.patch('/api/settings',headers=h,json={'chat_history':True})
    client.post('/api/chat',headers=h,json={'message':'How much can I save?'})
    assert len(client.get('/api/chat',headers=h).json)==2
    client.patch('/api/settings',headers=h,json={'chat_history':False})
    assert client.get('/api/chat',headers=h).json==[]


def test_goal_planning_contributions_and_cascade(client):
    h=register(client)
    g=client.post('/api/goals',headers=h,json={'name':'Laptop','target_amount':80000,'initial_saved':0,'target_date':(date.today()+timedelta(days=365)).isoformat(),'monthly_contribution':6667}).json
    assert g['required_monthly']==6666.67 and g['on_track']
    r=client.post(f'/api/goals/{g["id"]}/contributions',headers=h,json={'amount':10000})
    assert r.status_code==201 and r.json['remaining']==70000 and r.json['progress']==12.5
    assert client.get('/api/dashboard',headers=h).json['expenses']==0
    assert client.delete(f'/api/goals/{g["id"]}',headers=h).status_code==200


def test_budget_alert_and_recommendation_status(client):
    h=register(client)
    transaction(client,h,amount=200)
    r=client.put('/api/budgets',headers=h,json={'category_id':2,'amount':100})
    assert r.status_code==200 and r.json['budgets'][0]['spent']==200
    s=client.get('/api/dashboard',headers=h).json
    assert s['budget_utilization']==200
    recs=client.get('/api/recommendations',headers=h).json
    rec=next(r for r in recs if 'over budget' in r['title'])
    assert client.patch(f'/api/recommendations/{rec["id"]}',headers=h,json={'status':'accepted'}).status_code==200
    assert next(r for r in client.get('/api/recommendations',headers=h).json if r['id']==rec['id'])['status']=='accepted'


def test_no_fabricated_forecasts(client):
    h=register(client)
    assert client.post('/api/predictions',headers=h,json={}).json['status'] in ['insufficient_data','unavailable']


def test_sample_data_and_models(client):
    h=register(client)
    assert client.post('/api/demo',headers=h).status_code==200
    assert client.post('/api/demo',headers=h).status_code==400
    s=client.get('/api/dashboard',headers=h).json
    assert s['income']>0 and s['expenses']>0 and len(s['goals'])==3
    r=client.post('/api/predictions',headers=h,json={}).json
    if r['status']!='unavailable':
        assert r['status']=='trained',r
        assert r['metrics']['test_months']>=2
        assert r['metrics']['mae']>=0
        assert r['predicted_expenses']>=0
        assert r['savings_prediction']['metrics']['mae']>=0
    cat=client.post('/api/categorize',headers=h,json={'description':'Groceries dining'}).json
    if cat['status']!='unavailable':
        assert cat['status']=='trained',cat
        assert 0<=cat['holdout_accuracy']<=1


def test_currency_cannot_silently_relabel_records(client):
    h=register(client)
    assert client.patch('/api/profile',headers=h,json={'currency':'USD'}).status_code==200
    transaction(client,h)
    assert client.patch('/api/profile',headers=h,json={'currency':'EUR'}).status_code==400
