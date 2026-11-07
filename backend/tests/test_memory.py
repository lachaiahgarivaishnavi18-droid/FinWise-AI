from datetime import timedelta
from backend.models import db, UserMemory, MemoryEmbedding, now
from backend.tests.test_api import client, register
import io
import json


def test_semantic_embedding_lifecycle(client,monkeypatch):
    monkeypatch.setattr('backend.services.embed',lambda text:[1.0,0.0,0.0])
    h=register(client)
    r=client.post('/api/memories',headers=h,json={'content':'I prefer conservative savings goals','consent':True})
    assert r.status_code==201
    mid=r.json['id']
    with client.application.app_context():
        assert MemoryEmbedding.query.filter_by(memory_id=mid).count()==1
    result=client.post('/api/chat',headers=h,json={'message':'What is my preference?'}).json
    assert result['retrieval']=='semantic_local' and result['memory_ids']==[mid]
    assert client.patch(f'/api/memories/{mid}',headers=h,json={'content':'I prefer saving for an emergency fund','consent':True}).status_code==200
    with client.application.app_context():
        assert MemoryEmbedding.query.filter_by(memory_id=mid).count()==1
    assert client.delete(f'/api/memories/{mid}',headers=h).status_code==200
    with client.application.app_context():
        assert MemoryEmbedding.query.count()==0


def test_deduplication_normalizes_case_and_whitespace(client):
    h=register(client)
    assert client.post('/api/memories',headers=h,json={'content':'I prefer saving','consent':True}).status_code==201
    assert client.post('/api/memories',headers=h,json={'content':'  I  PREFER saving  ','consent':True}).status_code==409


def test_expiration_purge_cascades_to_vectors(client,monkeypatch):
    monkeypatch.setattr('backend.services.embed',lambda text:[1.0,0.0])
    h=register(client)
    mid=client.post('/api/memories',headers=h,json={'content':'I prefer saving','consent':True}).json['id']
    with client.application.app_context():
        db.session.get(UserMemory,mid).expires_at=now()-timedelta(days=1)
        db.session.commit()
    result=client.application.test_cli_runner().invoke(args=['purge-expired'])
    assert result.exit_code==0
    with client.application.app_context():
        assert UserMemory.query.count()==0 and MemoryEmbedding.query.count()==0


def test_summary_contains_only_current_approved_memories(client):
    h=register(client)
    client.post('/api/memories',headers=h,json={'content':'My priority is an emergency fund','consent':True})
    result=client.get('/api/memories/summary',headers=h).json
    assert result['count']==1 and 'emergency fund' in result['summary']


def test_llm_receives_authorized_grounding_and_memory_sources(client,monkeypatch):
    h=register(client)
    client.post('/api/memories',headers=h,json={'content':'I prefer saving 20 percent','consent':True})
    monkeypatch.setenv('OPENAI_API_KEY','test-key-not-a-real-secret')
    def fake_provider(req,timeout):
        payload=json.loads(req.data)
        assert 'Authorized data:' in payload['messages'][0]['content']
        assert 'I prefer saving 20 percent' in payload['messages'][0]['content']
        assert payload['messages'][-1]['content']=='How much am I saving?'
        return io.BytesIO(json.dumps({'choices':[{'message':{'content':'A grounded provider response.'}}]}).encode())
    monkeypatch.setattr('urllib.request.urlopen',fake_provider)
    r=client.post('/api/chat',headers=h,json={'message':'How much am I saving?'})
    assert r.status_code==200 and r.json['mode']=='llm'
    assert r.json['content']=='A grounded provider response.' and r.json['memory_ids']


def test_provider_failure_is_labeled_and_falls_back(client,monkeypatch):
    h=register(client)
    monkeypatch.setenv('OPENAI_API_KEY','test-key-not-a-real-secret')
    def fail_provider(*args,**kwargs):
        raise TimeoutError('test provider timeout')
    monkeypatch.setattr('urllib.request.urlopen',fail_provider)
    r=client.post('/api/chat',headers=h,json={'message':'How much can I save?'})
    assert r.status_code==200 and r.json['mode']=='provider_unavailable_fallback'
    assert '0.00' in r.json['content']
