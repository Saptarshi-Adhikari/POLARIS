async function listAscatBergs() {
  const bergs = ['a23a', 'd28', 'd15', 'b15', 'b22a', 'b27'];
  for (const b of bergs) {
    const url = `https://www.scp.byu.edu/data/iceberg/ascat/${b}.ascat`;
    try {
      const res = await fetch(url);
      console.log(`Checking ${b}.ascat: HTTP ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        console.log(`  -> ${b}.ascat: ${lines.length} observations! First: ${lines[0]}, Last: ${lines[lines.length - 1]}`);
      }
    } catch (e) {
      console.error(`Error on ${b}:`, e.message);
    }
  }
}
listAscatBergs();
