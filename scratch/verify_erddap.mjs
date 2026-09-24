async function testQuery2026() {
  const url = 'https://polarwatch.noaa.gov/erddap/tabledap/usnic_weekly_iceberg.json?time,latitude,longitude,Iceberg,length_nm,width,area,source,remarks&time>=2026-01-01';
  console.log('Fetching:', url);
  try {
    const res = await fetch(url);
    console.log('Status:', res.status, res.statusText);
    const json = await res.json();
    console.log('Rows count:', json.table.rows.length);
    console.log('Sample row:', json.table.rows[0]);
  } catch (e) {
    console.error('Error:', e);
  }
}
testQuery2026();
