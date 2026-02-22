import { useState, useEffect, useCallback } from 'react'
import { getTasks, createTask, updateTask, deleteTask } from './api'
import AddTaskForm from './components/AddTaskForm'
import TaskList from './components/TaskList'

const API_BASE = 'http://localhost:8002/api'

export default function App() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getTasks()
      setTasks(data)
    } catch (e) {
      console.error(e)
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const handleAddTask = async (task) => {
    await createTask(task)
    setModalOpen(false)
    loadTasks()
  }

  const handleUpdateStatus = async (id, status) => {
    await updateTask(id, { status })
    loadTasks()
  }

  const handleDelete = async (id) => {
    await deleteTask(id)
    loadTasks()
  }

  const completed = tasks.filter((t) => t.status === 'Done').length
  const pending = tasks.filter((t) => t.status !== 'Done').length

  return (
    <div className="app">
      <header className="header">Smart TaskFlow</header>

      <div className="stats">
        <div className="stat-card">
          <div className="value">{tasks.length}</div>
          <div className="label">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="value">{completed}</div>
          <div className="label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="value">{pending}</div>
          <div className="label">Pending</div>
        </div>
      </div>

      <div className="add-section">
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          Add Task
        </button>
      </div>

      {modalOpen && (
        <AddTaskForm
          onSave={handleAddTask}
          onCancel={() => setModalOpen(false)}
        />
      )}

      <TaskList
        tasks={tasks}
        loading={loading}
        onStatusChange={handleUpdateStatus}
        onDelete={handleDelete}
      />
    </div>
  )
}
