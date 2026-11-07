import os
import re
import secrets
from datetime import date, timedelta
from decimal import Decimal
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_jwt_extended import JWTManager, create_access_token, get_jwt, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from .models import *
from .services import CATEGORIES, money, month_range, summary, goal_data, budget_suggestions, recommendations, safe_memory, index_memory, reply


def create_app(test_config=None):
    instance_path = '/tmp/finwise-instance' if os.getenv('VERCEL') else os.path.join(os.path.dirname(os.path.abspath(__file__)),'instance')
    app = Flask(__name__, root_path=os.path.dirname(os.path.abspath(__file__)), instance_path=instance_path, static_folder='../dist', static_url_path='/')
    uri = os.getenv('DATABASE_URL', 'sqlite:///finwise.db')
    if uri.startswith('postgres://'):
        uri = uri.replace('postgres://','postgresql+psycopg://',1)
    elif uri.startswith('postgresql://'):
        uri = uri.replace('postgresql://','postgresql+psycopg://',1)
    secret = os.getenv('JWT_SECRET_KEY')
    if (os.getenv('RENDER') or os.getenv('VERCEL')) and (not secret or len(secret)<32):
        raise RuntimeError('Set a strong JWT_SECRET_KEY before deployment.')
    if os.getenv('VERCEL') and not uri.startswith('postgresql'):
        raise RuntimeError('A persistent PostgreSQL DATABASE_URL is required on Vercel.')
    app.config.update(SQLALCHEMY_DATABASE_URI=uri, JWT_SECRET_KEY=secret or secrets.token_hex(32), JWT_ACCESS_TOKEN_EXPIRES=timedelta(hours=8), MAX_CONTENT_LENGTH=256*1024, SQLALCHEMY_TRACK_MODIFICATIONS=False, SQLALCHEMY_ENGINE_OPTIONS={'pool_pre_ping':True,'pool_recycle':300})
    if test_config:
        app.config.update(test_config)
    db.init_app(app)
    if uri.startswith('sqlite:'):
        from sqlalchemy import event
        with app.app_context():
            @event.listens_for(db.engine,'connect')
            def sqlite_fk(conn, _):
                conn.execute('PRAGMA foreign_keys=ON')
    jwt = JWTManager(app)
    limiter = Limiter(get_remote_address,app=app,storage_uri=os.getenv('RATELIMIT_STORAGE_URI','memory://'),default_limits=['500 per hour'],enabled=not app.config.get('TESTING',False))
    app.extensions['finwise_limiter'] = limiter
    CORS(app,resources={r'/api/*':{'origins':os.getenv('CORS_ORIGINS','http://localhost:5173').split(',')}},supports_credentials=False)

    @jwt.token_in_blocklist_loader
    def revoked(_, payload):
        user = db.session.get(User,int(payload['sub']))
        return user is None or payload.get('version') != user.token_version

    @app.errorhandler(ValueError)
    def invalid(error):
        db.session.rollback()
        return jsonify(error=str(error)),400

    @app.errorhandler(IntegrityError)
    def conflict(error):
        db.session.rollback()
        return jsonify(error='This record conflicts with an existing record or constraint.'),409

    @app.errorhandler(404)
    def missing(error):
        return jsonify(error='Record not found.'),404

    @app.errorhandler(429)
    def throttled(error):
        return jsonify(error='Too many requests. Please wait and try again.'),429

    @app.errorhandler(500)
    def server_error(error):
        db.session.rollback()
        return jsonify(error='The request could not be completed. Check server configuration and logs.'),500

    def uid():
        return int(get_jwt_identity())

    def data():
        body = request.get_json(silent=True)
        if not isinstance(body,dict):
            raise ValueError('A JSON object is required.')
        return body

    def owned(model, id):
        return model.query.filter_by(id=id,user_id=uid()).first_or_404()

    def text(value, maximum=250):
        if not isinstance(value,str) or not value.strip() or len(value)>maximum:
            raise ValueError(f'Text must contain 1–{maximum} characters.')
        return value.strip()

    def iso_date(value):
        try:
            return date.fromisoformat(value)
        except (ValueError,TypeError):
            raise ValueError('Enter a valid date in YYYY-MM-DD format.')

    def boolean(value):
        if not isinstance(value,bool):
            raise ValueError('A true or false value is required.')
        return value

    def integer(value):
        if isinstance(value,bool) or not re.fullmatch(r'\d+',str(value)):
            raise ValueError('Enter a valid whole number.')
        return int(value)

    def month_arg():
        value = request.args.get('month',date.today().strftime('%Y-%m'))
        month_range(value)
        return value

    def serialize(record):
        result = {}
        for c in record.__table__.columns:
            v = getattr(record,c.name)
            result[c.name] = float(v) if isinstance(v,Decimal) else v.isoformat() if isinstance(v,(date,datetime)) else v
        result.pop('user_id',None)
        if isinstance(record,ExpenseRecord):
            result['category'] = record.category.name
            result['kind'] = 'expense'
        if isinstance(record,IncomeRecord):
            result['category'] = record.source
            result['kind'] = 'income'
        return result

    def auth_response(user):
        return jsonify(token=create_access_token(identity=str(user.id),additional_claims={'version':user.token_version}),user={'id':user.id,'name':user.name,'email':user.email})

    @app.get('/api/health')
    def health():
        db.session.execute(db.text('SELECT 1'))
        return jsonify(status='ok')

    @app.post('/api/auth/register')
    @limiter.limit('10 per hour')
    def register():
        body = data()
        email = text(body.get('email'),254).lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):
            raise ValueError('Enter a valid email address.')
        password = text(body.get('password'),128)
        if len(password)<12:
            raise ValueError('Use a password of at least 12 characters.')
        user = User(name=text(body.get('name'),100),email=email,password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.flush()
        db.session.add_all([UserProfile(user_id=user.id),NotificationPreference(user_id=user.id)])
        db.session.commit()
        return auth_response(user),201

    @app.post('/api/auth/login')
    @limiter.limit('10 per minute')
    def login():
        body = data()
        email = text(body.get('email'),254).lower()
        user = User.query.filter_by(email=email).first()
        if not user or not check_password_hash(user.password_hash,text(body.get('password'),128)):
            return jsonify(error='Invalid email or password.'),401
        return auth_response(user)

    @app.post('/api/auth/logout')
    @jwt_required()
    def logout():
        user = db.session.get(User,uid())
        user.token_version += 1
        db.session.commit()
        return jsonify(ok=True)

    @app.route('/api/profile',methods=['GET','PATCH'])
    @jwt_required()
    def profile():
        user = db.session.get(User,uid())
        p = UserProfile.query.filter_by(user_id=uid()).one()
        if request.method == 'PATCH':
            body = data()
            for key in ['monthly_income','fixed_expenses','variable_expenses','savings','debt','preferred_savings']:
                if key in body:
                    setattr(p,key,money(body[key]))
            for key in ['income_source','responsibilities','preferences','short_term_goals','long_term_goals']:
                if key in body:
                    setattr(p,key,text(body[key],2000) if body[key] else '')
            if 'name' in body:
                user.name = text(body['name'],100)
            if 'currency' in body:
                if body['currency'] not in ['INR','USD','EUR','GBP']:
                    raise ValueError('Unsupported currency.')
                if body['currency'] != p.currency and (IncomeRecord.query.filter_by(user_id=uid()).first() or ExpenseRecord.query.filter_by(user_id=uid()).first() or FinancialGoal.query.filter_by(user_id=uid()).first()):
                    raise ValueError('Currency cannot change after financial records are created. Amounts are not converted.')
                p.currency = body['currency']
            if 'risk_preference' in body:
                if body['risk_preference'] not in ['Conservative','Moderate','Aggressive']:
                    raise ValueError('Choose a valid risk preference.')
                p.risk_preference = body['risk_preference']
            db.session.commit()
        return jsonify(profile=serialize(p),user=dict(id=user.id,name=user.name,email=user.email))

    @app.get('/api/categories')
    @jwt_required()
    def categories():
        return jsonify([dict(id=c.id,name=c.name) for c in ExpenseCategory.query.all()])

    def transaction_values(record, body):
        if 'amount' in body:
            record.amount = money(body['amount'],True)
        if 'description' in body:
            record.description = text(body['description'])
        if 'date' in body:
            record.date = iso_date(body['date'])
        if 'recurring' in body:
            record.recurring = boolean(body['recurring'])
        if isinstance(record,ExpenseRecord) and 'category_id' in body:
            category = db.session.get(ExpenseCategory,integer(body['category_id']))
            if category is None:
                raise ValueError('Select a valid expense category.')
            record.category_id = category.id
        if isinstance(record,IncomeRecord) and 'source' in body:
            record.source = text(body['source'],40)

    @app.route('/api/transactions',methods=['GET','POST'])
    @jwt_required()
    def transactions():
        if request.method == 'POST':
            body = data()
            if body.get('kind') not in ['income','expense']:
                raise ValueError('Choose income or expense.')
            for key in ['amount','description','date']+(['category_id'] if body['kind']=='expense' else []):
                if key not in body:
                    raise ValueError(f'{key} is required.')
            record = ExpenseRecord(user_id=uid()) if body['kind']=='expense' else IncomeRecord(user_id=uid())
            transaction_values(record,body)
            db.session.add(record)
            db.session.commit()
            return jsonify(serialize(record)),201
        result = []
        for model in [IncomeRecord,ExpenseRecord]:
            query = model.query.filter_by(user_id=uid())
            for key, op in [('start','ge'),('end','le')]:
                if request.args.get(key):
                    dt = iso_date(request.args[key])
                    query = query.filter(model.date >= dt) if op=='ge' else query.filter(model.date <= dt)
            if request.args.get('month'):
                a,b = month_range(request.args['month'])
                query = query.filter(model.date >= a,model.date < b)
            if request.args.get('min'):
                query = query.filter(model.amount >= money(request.args['min']))
            if request.args.get('max'):
                query = query.filter(model.amount <= money(request.args['max']))
            if request.args.get('kind') and request.args['kind'] != ('income' if model is IncomeRecord else 'expense'):
                continue
            if request.args.get('category'):
                if model is IncomeRecord:
                    continue
                query = query.filter(model.category_id == integer(request.args['category']))
            result.extend(serialize(r) for r in query.order_by(model.date.desc()).limit(1000))
        return jsonify(sorted(result,key=lambda r:(r['date'],r['id']),reverse=True))

    @app.route('/api/transactions/<kind>/<int:id>',methods=['PATCH','DELETE'])
    @jwt_required()
    def transaction(kind,id):
        if kind not in ['expense','income']:
            raise ValueError('Invalid transaction kind.')
        record = owned(ExpenseRecord if kind=='expense' else IncomeRecord,id)
        if request.method == 'DELETE':
            db.session.delete(record)
        else:
            transaction_values(record,data())
        db.session.commit()
        return jsonify(ok=True)

    @app.get('/api/dashboard')
    @jwt_required()
    def dashboard():
        return jsonify(summary(uid(),month_arg()))

    @app.route('/api/goals',methods=['GET','POST'])
    @jwt_required()
    def goals():
        if request.method == 'GET':
            return jsonify([goal_data(g) for g in FinancialGoal.query.filter_by(user_id=uid()).all()])
        body = data()
        goal = FinancialGoal(user_id=uid(),name=text(body.get('name'),100),target_amount=money(body.get('target_amount'),True),initial_saved=money(body.get('initial_saved',0)),target_date=iso_date(body.get('target_date')),monthly_contribution=money(body.get('monthly_contribution',0)),priority=body.get('priority','Medium'))
        if goal.priority not in ['High','Medium','Low']:
            raise ValueError('Invalid priority.')
        db.session.add(goal)
        db.session.commit()
        return jsonify(goal_data(goal)),201

    @app.route('/api/goals/<int:id>',methods=['PATCH','DELETE'])
    @jwt_required()
    def goal(id):
        g = owned(FinancialGoal,id)
        if request.method == 'DELETE':
            db.session.delete(g)
        else:
            body = data()
            if 'name' in body:
                g.name = text(body['name'],100)
            for key in ['target_amount','initial_saved','monthly_contribution']:
                if key in body:
                    setattr(g,key,money(body[key],key=='target_amount'))
            if 'target_date' in body:
                g.target_date = iso_date(body['target_date'])
            if 'priority' in body:
                if body['priority'] not in ['High','Medium','Low']:
                    raise ValueError('Invalid priority.')
                g.priority = body['priority']
        db.session.commit()
        return jsonify(ok=True)

    @app.post('/api/goals/<int:id>/contributions')
    @jwt_required()
    def contribute(id):
        g = owned(FinancialGoal,id)
        body = data()
        c = GoalContribution(user_id=uid(),goal_id=g.id,amount=money(body.get('amount'),True),date=iso_date(body.get('date',date.today().isoformat())))
        db.session.add(c)
        db.session.commit()
        return jsonify(goal_data(g)),201

    @app.route('/api/budgets',methods=['GET','PUT'])
    @jwt_required()
    def budgets():
        month = month_arg()
        if request.method == 'PUT':
            body = data()
            category_id = integer(body.get('category_id',0))
            if not db.session.get(ExpenseCategory,category_id):
                raise ValueError('Invalid category.')
            status = body.get('status','accepted')
            if status not in ['accepted','rejected']:
                raise ValueError('Invalid budget status.')
            b = Budget.query.filter_by(user_id=uid(),month=month,category_id=category_id).first()
            if not b:
                b = Budget(user_id=uid(),month=month,category_id=category_id)
                db.session.add(b)
            b.amount = money(body.get('amount'))
            b.status = status
            db.session.commit()
        s = summary(uid(),month)
        records = Budget.query.filter_by(user_id=uid(),month=month).all()
        rejected = {b.category_id for b in records if b.status=='rejected'}
        return jsonify(budgets=[dict(**serialize(b),category=db.session.get(ExpenseCategory,b.category_id).name,spent=s['categories'].get(db.session.get(ExpenseCategory,b.category_id).name,0)) for b in records],suggestions=[s for s in budget_suggestions(uid(),month) if s['category_id'] not in rejected])

    @app.get('/api/recommendations')
    @jwt_required()
    def get_recommendations():
        result = recommendations(uid(),month_arg())
        db.session.commit()
        return jsonify(result)

    @app.patch('/api/recommendations/<int:id>')
    @jwt_required()
    def change_recommendation(id):
        r = owned(Recommendation,id)
        status = data().get('status')
        if status not in ['accepted','rejected','dismissed']:
            raise ValueError('Invalid recommendation status.')
        r.status = status
        db.session.commit()
        return jsonify(ok=True)

    @app.route('/api/settings',methods=['GET','PATCH'])
    @jwt_required()
    def settings():
        p = NotificationPreference.query.filter_by(user_id=uid()).one()
        if request.method == 'PATCH':
            body = data()
            for key in ['memory_enabled','chat_history','budget_alerts']:
                if key in body:
                    setattr(p,key,boolean(body[key]))
            if not p.chat_history:
                Conversation.query.filter_by(user_id=uid()).delete()
            db.session.commit()
        return jsonify(serialize(p))

    @app.route('/api/memories',methods=['GET','POST','DELETE'])
    @jwt_required()
    def memories():
        if request.method == 'GET':
            return jsonify([dict(**serialize(m),stale=m.expires_at <= now()) for m in UserMemory.query.filter_by(user_id=uid()).order_by(UserMemory.updated_at.desc())])
        if request.method == 'DELETE':
            for m in UserMemory.query.filter_by(user_id=uid()):
                db.session.delete(m)
            db.session.commit()
            return jsonify(ok=True)
        if not NotificationPreference.query.filter_by(user_id=uid()).one().memory_enabled:
            raise ValueError('Enable memory in Settings before approving new memories.')
        body = data()
        if body.get('consent') is not True:
            raise ValueError('Explicit approval is required to store a memory.')
        content = ' '.join(text(body.get('content'),2000).split())
        safe_memory(content)
        if UserMemory.query.filter(UserMemory.user_id==uid(),db.func.lower(UserMemory.content)==content.lower()).first():
            return jsonify(error='This memory is already saved. Correct the existing memory instead.'),409
        kind = body.get('kind','long_term')
        if kind not in ['long_term','episodic']:
            raise ValueError('Invalid memory type.')
        days = integer(body.get('expires_in_days',90))
        if days<1 or days>365:
            raise ValueError('Memory expiration must be 1–365 days.')
        memory = UserMemory(user_id=uid(),content=content,kind=kind,expires_at=now()+timedelta(days=days))
        db.session.add(memory)
        db.session.flush()
        index_memory(memory)
        db.session.commit()
        return jsonify(serialize(memory)),201

    @app.route('/api/memories/<int:id>',methods=['PATCH','DELETE'])
    @jwt_required()
    def memory(id):
        m = owned(UserMemory,id)
        if request.method == 'DELETE':
            db.session.delete(m)
        else:
            body = data()
            if body.get('consent') is not True:
                raise ValueError('Approve the corrected memory before saving.')
            m.content = ' '.join(text(body.get('content'),2000).split())
            safe_memory(m.content)
            if UserMemory.query.filter(UserMemory.user_id==uid(),UserMemory.id!=m.id,db.func.lower(UserMemory.content)==m.content.lower()).first():
                return jsonify(error='This duplicates another saved memory.'),409
            m.expires_at = now()+timedelta(days=90)
            index_memory(m)
        db.session.commit()
        return jsonify(ok=True)

    @app.get('/api/chat')
    @jwt_required()
    def chat_history():
        rows = Message.query.filter_by(user_id=uid()).filter(Message.expires_at > now()).order_by(Message.created_at.desc()).limit(100).all()
        return jsonify([dict(role=m.role,content=m.content) for m in reversed(rows)])

    @app.delete('/api/chat')
    @jwt_required()
    def clear_chat():
        for c in Conversation.query.filter_by(user_id=uid()):
            db.session.delete(c)
        db.session.commit()
        return jsonify(ok=True)

    @app.post('/api/chat')
    @limiter.limit('20 per minute')
    @jwt_required()
    def chat():
        body = data()
        message = text(body.get('message'),4000)
        safe_memory(message)  # prevent credentials from entering provider context or history
        pref = NotificationPreference.query.filter_by(user_id=uid()).one()
        history = body.get('history',[])
        if not isinstance(history,list):
            raise ValueError('Invalid conversation history.')
        history = [{'role':h['role'],'content':text(h.get('content'),4000)} for h in history[-12:] if isinstance(h,dict) and h.get('role') in ['user','assistant']]
        for item in history:
            safe_memory(item['content'])
        answer,mode,used,retrieval = reply(uid(),message,history)
        if pref.chat_history:
            c = Conversation.query.filter_by(user_id=uid()).first()
            if c is None:
                c = Conversation(user_id=uid())
                db.session.add(c)
                db.session.flush()
            db.session.add_all([Message(user_id=uid(),conversation_id=c.id,role=role,content=content,expires_at=now()+timedelta(days=30)) for role,content in [('user',message),('assistant',answer)]])
            db.session.commit()
        return jsonify(content=answer,mode=mode,retrieval=retrieval,memory_ids=[m.id for m in used],memory_candidate=message if any(w in message.lower() for w in ['remember','prefer','my salary','my income']) else None)

    @app.post('/api/predictions')
    @jwt_required()
    def predictions():
        from .ml import predict
        return jsonify(predict(uid()))

    @app.post('/api/categorize')
    @jwt_required()
    def categorize():
        from .ml import categorize
        return jsonify(categorize(uid(),text(data().get('description'))))

    @app.post('/api/demo')
    @jwt_required()
    def demo():
        if IncomeRecord.query.filter_by(user_id=uid()).first() or ExpenseRecord.query.filter_by(user_id=uid()).first() or FinancialGoal.query.filter_by(user_id=uid()).first():
            raise ValueError('Sample data can only be added to an account with no financial records or goals.')
        import random
        rng = random.Random(23)
        today = date.today()
        cats = {c.name:c.id for c in ExpenseCategory.query.all()}
        for offset in range(10):
            n = today.year*12+today.month-1-offset
            year,month = n//12,n%12+1
            db.session.add(IncomeRecord(user_id=uid(),amount=85000+offset%3*2000,source='Salary',description='Sample · monthly salary',date=date(year,month,1),recurring=True))
            for cat,base in [('Housing',22000),('Food',8500),('Transportation',3200),('Utilities',2800),('Entertainment',3000),('Shopping',4000),('Healthcare',1500),('Travel',2500)]:
                for j in range(3 if cat!='Housing' else 1):
                    day = min(today.day,2+j*3) if offset==0 else 2+j*3
                    amount = round(base/(3 if cat!='Housing' else 1)*rng.uniform(.8,1.25),2)
                    db.session.add(ExpenseRecord(user_id=uid(),category_id=cats[cat],amount=amount,description='Sample · '+{'Housing':'Apartment rent','Food':'Groceries & dining','Transportation':'Metro & rides','Utilities':'Internet & electricity','Entertainment':'Movies & subscriptions','Shopping':'Personal shopping','Healthcare':'Pharmacy','Travel':'Weekend getaway'}[cat],date=date(year,month,day),recurring=cat in ['Housing','Utilities']))
        p = UserProfile.query.filter_by(user_id=uid()).one()
        p.monthly_income = 85000
        p.preferred_savings = 20000
        p.savings = 180000
        for name,target,saved,days,monthly in [('Emergency fund',300000,180000,365,12000),('Japan adventure',180000,65000,300,9000),('A new laptop',90000,42000,180,8000)]:
            db.session.add(FinancialGoal(user_id=uid(),name=name,target_amount=target,initial_saved=saved,target_date=today+timedelta(days=days),monthly_contribution=monthly,priority='High' if 'Emergency' in name else 'Medium'))
        for cat,limit in [('Housing',25000),('Food',9000),('Transportation',4000),('Utilities',3500),('Entertainment',3500),('Shopping',4000),('Healthcare',2000),('Travel',3500)]:
            db.session.add(Budget(user_id=uid(),category_id=cats[cat],month=today.strftime('%Y-%m'),amount=limit))
        db.session.commit()
        return jsonify(ok=True,label='Sample data; not your real finances.')

    @app.cli.command('init-db')
    def init_db():
        db.create_all()
        for name in CATEGORIES:
            if not ExpenseCategory.query.filter_by(name=name).first():
                db.session.add(ExpenseCategory(name=name))
        db.session.commit()
        print('Database initialized.')

    @app.cli.command('purge-expired')
    def purge_expired():
        Message.query.filter(Message.expires_at <= now()).delete()
        for m in UserMemory.query.filter(UserMemory.expires_at <= now()):
            db.session.delete(m)
        db.session.commit()
        print('Expired chat messages and memories deleted.')

    @app.cli.command('index-memories')
    def index_memories():
        for m in UserMemory.query.filter(UserMemory.expires_at > now(),UserMemory.status=='approved'):
            index_memory(m)
        db.session.commit()
        print('Current approved memories indexed using configured embedding model.')

    @app.get('/api/memories/summary')
    @jwt_required()
    def memory_summary():
        rows=UserMemory.query.filter_by(user_id=uid(),status='approved').filter(UserMemory.expires_at > now()).order_by(UserMemory.updated_at.desc()).all()
        return jsonify(summary='\n'.join(f'[{m.id}] {m.content}' for m in rows[:20]),count=len(rows),method='Extractive summary of current approved memories; not stored separately.')

    @app.get('/')
    @app.get('/<path:path>')
    def frontend(path='index.html'):
        if path.startswith('api/'):
            return jsonify(error='Endpoint not found.'),404
        full = os.path.join(app.static_folder,path)
        return send_from_directory(app.static_folder,path if os.path.isfile(full) else 'index.html')

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1',port=5000,debug=os.getenv('FLASK_DEBUG')=='true')
