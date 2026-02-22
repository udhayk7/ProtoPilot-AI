import TaskItem from './TaskItem'

const STATUSES = ['Todo', 'In Progress', 'Done']

export default function TaskList({ tasks, loading, onStatusChange, onDelete }) {
  if (loading) {
    return (
      <div className="task-list">
        <div className="empty">Loading...</div>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="task-list">
        <div className="empty">No tasks yet. Add one to get started.</div>
      </div>
    )
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          statusOptions={STATUSES}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
