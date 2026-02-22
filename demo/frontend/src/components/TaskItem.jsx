export default function TaskItem({ task, statusOptions, onStatusChange, onDelete }) {
  const created = task.created_at
    ? new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="task-item">
      <div className="task-content">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className={`priority-${task.priority}`}>{task.priority}</span>
          {task.description && ` · ${task.description.slice(0, 60)}${task.description.length > 60 ? '…' : ''}`}
          {created && ` · ${created}`}
        </div>
      </div>
      <div className="task-actions">
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          aria-label="Status"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => onDelete(task.id)}
          aria-label="Delete"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
