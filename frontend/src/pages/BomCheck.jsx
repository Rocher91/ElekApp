import Header from '../components/Header';
import Card from '../components/ui/Card';

export default function BomCheck({
  loading,
  bomCheckResult,
  checkBom,
  Tabs
}) {
  return (
    <main>
      
      <Header
        title="BOM Check"
      />

      <Tabs />

      <Card title="Comprobar BOM">
        <input
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={e => checkBom(e.target.files?.[0])}
        />

        {loading && <p>Analizando BOM...</p>}
        
      </Card>

      {bomCheckResult && (
        <Card title="Resultado">

          <div className="bom-summary">
            <div>Total items: <strong>{bomCheckResult.total_items}</strong></div>
            <div>OK: <strong>{bomCheckResult.ok_items}</strong></div>
            <div>Sin MPS PN: <strong>{bomCheckResult.missing_mps_pn}</strong></div>
            <div>Sin Manufacturer PN: <strong>{bomCheckResult.missing_manufacturer_part_number}</strong></div>
          </div>

          <h3>Componentes con errores</h3>

          <div className="bom-check-table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Reference</th>
                  <th>Value</th>
                  <th>Manufacturer</th>
                  <th>Manufacturer PN</th>
                  <th>MPS PN</th>
                  <th>Errors</th>
                </tr>
              </thead>

              <tbody>
                {bomCheckResult.items
                  .filter(item => !item.is_ok)
                  .map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.item}</td>
                      <td>{item.references}</td>
                      <td>{item.value}</td>
                      <td>{item.manufacturer}</td>
                      <td>{item.manufacturer_part_number}</td>
                      <td>{item.mps_pn}</td>
                      <td>{item.errors.join(', ')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}