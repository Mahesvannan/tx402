const button = document.querySelector('#demo-button');
const example = document.querySelector('#demo-example');
const output = document.querySelector('#demo-output');

async function runDemo() {
  button.disabled = true;
  output.textContent = 'Explaining the Mainnet transaction…';

  try {
    const response = await fetch(`/demo?example=${encodeURIComponent(example.value)}`, {
      headers: { accept: 'application/json' },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Demo returned HTTP ${response.status}`);

    output.textContent = JSON.stringify(
      {
        summary: body.summary,
        txid: body.txid,
        network: body.network,
        details: body.details,
      },
      null,
      2
    );
  } catch (err) {
    output.textContent = `Demo unavailable: ${err.message}`;
  } finally {
    button.disabled = false;
  }
}

button?.addEventListener('click', runDemo);

