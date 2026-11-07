"""Per-user models. No cross-user training or fabricated evaluation metrics."""
from pathlib import Path
import os
from datetime import date
from .models import db, ExpenseRecord, IncomeRecord, MLPrediction


def predict(uid):
    try:
        import numpy as np
        import pandas as pd
        import joblib
        from sklearn.linear_model import LinearRegression
        from sklearn.ensemble import IsolationForest
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    except ImportError:
        return {'status':'unavailable','reason':'Install the ML dependencies to train models.'}
    rows = ExpenseRecord.query.filter_by(user_id=uid).order_by(ExpenseRecord.date).all()
    if not rows:
        return {'status':'insufficient_data','reason':'Add at least 8 completed calendar months of expense history.'}
    frame = pd.DataFrame([{'date':r.date,'amount':float(r.amount),'id':r.id} for r in rows])
    frame['date'] = pd.to_datetime(frame['date'])
    current = pd.Timestamp(date.today().replace(day=1))
    frame = frame[frame.date < current]
    if frame.empty:
        return {'status':'insufficient_data','reason':'Only completed months are used. At least 8 are required.'}
    totals = frame.set_index('date').amount.resample('MS').sum().reindex(pd.date_range(frame.date.min().replace(day=1),current-pd.offsets.MonthBegin(1),freq='MS'),fill_value=0)
    observed_months = frame.date.dt.to_period('M').nunique()
    if observed_months < 8:
        return {'status':'insufficient_data','reason':f'{observed_months} completed months with records; 8 required. Months without records cannot be assumed complete.'}
    # Missing calendar months are marked; they are not silently imputed as observed spending.
    recorded = set(frame.date.dt.strftime('%Y-%m'))
    if any(m.strftime('%Y-%m') not in recorded for m in totals.index):
        return {'status':'insufficient_data','reason':'There are gaps in your monthly expense history. Complete missing months before training.'}
    x = np.arange(len(totals)).reshape(-1,1)
    y = totals.to_numpy()
    split = max(4,int(len(y)*.75))
    model = LinearRegression().fit(x[:split],y[:split])
    test = model.predict(x[split:])
    metrics = {'mae':round(float(mean_absolute_error(y[split:],test)),2),'rmse':round(float(np.sqrt(mean_squared_error(y[split:],test))),2),'r2':round(float(r2_score(y[split:],test)),3) if len(test)>1 and float(np.var(y[split:]))>0 else None,'train_months':split,'test_months':len(test),'split':'chronological holdout'}
    model.fit(x,y)
    prediction = max(0,float(model.predict([[len(y)+1]])[0]))
    store = Path(os.getenv('MODEL_STORE_DIR','/tmp/finwise-models' if os.getenv('VERCEL') else str(Path(__file__).parent/'models_store')))
    store.mkdir(exist_ok=True,parents=True)
    joblib.dump({'model':model,'trained_months':[d.strftime('%Y-%m') for d in totals.index],'metrics':metrics},store/f'expenses_{uid}.joblib')
    anomalies = []
    if len(frame)>=20:
        detector = IsolationForest(random_state=42,contamination=.08)
        labels = detector.fit_predict(np.log1p(frame[['amount']]))
        anomalies = frame.loc[labels==-1,'id'].astype(int).tolist()
    income_rows = IncomeRecord.query.filter_by(user_id=uid).all()
    incomes = {m:0.0 for m in recorded}
    for r in income_rows:
        m = r.date.strftime('%Y-%m')
        if m in incomes:
            incomes[m] += float(r.amount)
    # Savings estimate only if every training month has recorded income.
    savings = None
    if all(v>0 for v in incomes.values()):
        income_y = np.array([incomes[d.strftime('%Y-%m')] for d in totals.index])
        savings_y = income_y-y
        savings_model = LinearRegression().fit(x[:split],savings_y[:split])
        heldout = savings_model.predict(x[split:])
        savings_metrics = {'mae':round(float(mean_absolute_error(savings_y[split:],heldout)),2),'rmse':round(float(np.sqrt(mean_squared_error(savings_y[split:],heldout))),2),'r2':round(float(r2_score(savings_y[split:],heldout)),3) if len(heldout)>1 and float(np.var(savings_y[split:]))>0 else None}
        savings_model.fit(x,savings_y)
        savings = {'amount':round(float(savings_model.predict([[len(y)+1]])[0]),2),'metrics':savings_metrics}
        joblib.dump(savings_model,store/f'savings_{uid}.joblib')
    result = {'status':'trained','model':'LinearRegression','predicted_expenses':round(prediction,2),'prediction_month':(current+pd.offsets.MonthBegin(1)).strftime('%Y-%m'),'metrics':metrics,'unusual_transaction_ids':anomalies,'savings_prediction':savings,'caveat':'Historical estimate, not a guarantee. Missing transactions and changing circumstances affect results.'}
    db.session.add(MLPrediction(user_id=uid,model='expense_regression',result=result))
    db.session.commit()
    return result


def categorize(uid, description):
    try:
        from sklearn.pipeline import make_pipeline
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.naive_bayes import MultinomialNB
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import accuracy_score
        import joblib
    except ImportError:
        return {'status':'unavailable','reason':'Install ML dependencies.'}
    rows = ExpenseRecord.query.filter_by(user_id=uid).all()
    counts = {}
    for r in rows:
        counts[r.category.name] = counts.get(r.category.name,0)+1
    if len(rows)<30 or len(counts)<2 or min(counts.values())<3:
        return {'status':'insufficient_data','reason':'Need 30 labeled transactions, 2 categories, and at least 3 examples per category.'}
    x_train,x_test,y_train,y_test = train_test_split([r.description for r in rows],[r.category.name for r in rows],test_size=.25,random_state=42,stratify=[r.category.name for r in rows])
    model = make_pipeline(TfidfVectorizer(ngram_range=(1,2)),MultinomialNB())
    model.fit(x_train,y_train)
    accuracy = float(accuracy_score(y_test,model.predict(x_test)))
    model.fit([r.description for r in rows],[r.category.name for r in rows])
    path = Path(os.getenv('MODEL_STORE_DIR','/tmp/finwise-models' if os.getenv('VERCEL') else str(Path(__file__).parent/'models_store')))
    path.mkdir(exist_ok=True,parents=True)
    joblib.dump(model,path/f'categorizer_{uid}.joblib')
    return {'status':'trained','category':str(model.predict([description])[0]),'holdout_accuracy':round(accuracy,3),'test_records':len(x_test),'requires_user_review':True}
