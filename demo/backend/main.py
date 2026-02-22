from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db, init_db
from models import Task

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5180"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "Medium"
    status: str = "Todo"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


def task_to_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description or "",
        "priority": task.priority,
        "status": task.status,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@app.get("/api/tasks")
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(Task).order_by(Task.created_at.desc()).all()
    return [task_to_dict(t) for t in tasks]


@app.post("/api/tasks")
def create_task(body: TaskCreate, db: Session = Depends(get_db)):
    task = Task(
        title=body.title,
        description=body.description,
        priority=body.priority,
        status=body.status,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_to_dict(task)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.title is not None:
        task.title = body.title
    if body.description is not None:
        task.description = body.description
    if body.priority is not None:
        task.priority = body.priority
    if body.status is not None:
        task.status = body.status
    db.commit()
    db.refresh(task)
    return task_to_dict(task)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
