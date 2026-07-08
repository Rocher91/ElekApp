export default function Header({
  title,
  subtitle,
  children
}) {
  return (
    <header>
      <div>
        <h1>{title}</h1>

        {subtitle && (
          <p>{subtitle}</p>
        )}
      </div>

      {children}
    </header>
  );
}