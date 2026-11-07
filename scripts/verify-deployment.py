"""Smoke-test a deployment with a temporary synthetic account, then remove it.

Run under `vercel env run -e production` so cleanup can use the connected DB.
No credentials or tokens are printed or written to disk.
"""
import json
import os
import secrets
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
os.environ['JWT_SECRET_KEY'] = secrets.token_hex(48)  # local cleanup app only
from backend.app import create_app
from backend.models import db, User

base = 'https://finwise-ai-five.vercel.app'
email = 'deploy-check-'+secrets.token_hex(8)+'@finwise.invalid'
token = None
created_id = None


def call(path,method='GET',body=None):
    headers={'Content-Type':'application/json'}
    if token:
        headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+'/api'+path,method=method,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.load(response)


try:
    result=call('/auth/register','POST',{'name':'Deployment verification','email':email,'password':secrets.token_urlsafe(30)})
    token=result['token']
    created_id=result['user']['id']
    print('Registration: passed')
    call('/transactions','POST',{'kind':'income','source':'Test','description':'Synthetic verification income','amount':'1000.10','date':date.today().isoformat()})
    call('/transactions','POST',{'kind':'expense','description':'Synthetic verification expense','amount':'200.05','date':date.today().isoformat(),'category_id':2})
    dashboard=call('/dashboard?month='+date.today().strftime('%Y-%m'))
    assert dashboard['income']==1000.1 and dashboard['expenses']==200.05 and dashboard['savings']==800.05
    print('Persistent transactions and exact totals: passed')
    goal=call('/goals','POST',{'name':'Synthetic goal','target_amount':'1000','target_date':(date.today()+timedelta(days=365)).isoformat(),'monthly_contribution':100})
    contribution=call('/goals/'+str(goal['id'])+'/contributions','POST',{'amount':100})
    assert contribution['remaining']==900
    print('Goals and contributions: passed')
    memory=call('/memories','POST',{'content':'Synthetic verification preference: I prefer saving 20 percent.','consent':True})
    assert memory['id'] in [m['id'] for m in call('/memories')]
    chat=call('/chat','POST',{'message':'What is my saving preference?'})
    assert memory['id'] in chat['memory_ids']
    print('Approved memory storage and chat retrieval: passed')
    assert call('/predictions','POST',{})['status']=='insufficient_data'
    print('Scientific dependencies and data sufficiency check: passed')
    call('/auth/logout','POST',{})
    print('Logout: passed')
finally:
    if created_id is not None:
        app=create_app()
        with app.app_context():
            user=User.query.filter_by(id=created_id,email=email,name='Deployment verification').one()
            db.session.delete(user)
            db.session.commit()
            print('Temporary verification account and records removed.')
