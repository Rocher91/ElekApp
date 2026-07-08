export default function ProgressBar({ value = 0, className = '' }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className={`progress-bar ${className}`}>
      <div style={{ width: `${safeValue}%` }} />
    </div>
  );
}