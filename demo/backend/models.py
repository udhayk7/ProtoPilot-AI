from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(String(1000), default="")
    priority = Column(String(20), default="Medium")
    status = Column(String(20), default="Todo")
    created_at = Column(DateTime, default=datetime.utcnow)
