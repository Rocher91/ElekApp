export default function Field({ label, value }) {
  return (
    <>
      <label>{label}</label>
      <div className="field">{value || '-'}</div>
    </>
  );
}