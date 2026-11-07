"""Initialize a fresh schema and PostgreSQL vector extension. Not a schema upgrader."""
from pathlib import Path
from .app import create_app
from .models import db, ExpenseCategory
from .services import CATEGORIES


def bootstrap():
    app = create_app()
    with app.app_context():
        db.create_all()
        if db.engine.dialect.name == 'postgresql':
            script = (Path(__file__).parent/'migrations'/'001_pgvector.sql').read_text()
            with db.engine.begin() as conn:
                for statement in script.split(';'):
                    statement = '\n'.join(line for line in statement.splitlines() if not line.strip().startswith('--')).strip()
                    if statement and statement not in ['BEGIN','COMMIT']:
                        conn.execute(db.text(statement))
        for name in CATEGORIES:
            if not ExpenseCategory.query.filter_by(name=name).first():
                db.session.add(ExpenseCategory(name=name))
        db.session.commit()
        print('FinWise database initialized.')


if __name__ == '__main__':
    bootstrap()
