// Run with Expo on port 8091 and playwright-cli run-code --filename this file.
async (page) => {
  await page.goto('http://localhost:8091');
  await page.getByRole('textbox').first().fill('teste-navegacao-local');
  await page.getByText('Continuar em modo local', { exact: true }).click();
  const bar = page.getByLabel('Navegação principal', { exact: true });
  await bar.waitFor();
  const results = [];
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    for (const name of ['Lotes', 'Início', 'Perfil', 'Início']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(500);
      const button = page.getByRole('button', { name, exact: true });
      if (await button.getAttribute('aria-pressed') !== 'true') throw Error(`Seleção incorreta: ${name}`);
      const box = await bar.boundingBox();
      if (!box || box.y < 0 || box.y + box.height > size.height || box.x < 0 || box.x + box.width > size.width) {
        throw Error(`Barra fora da tela: ${JSON.stringify({ name, size, box })}`);
      }
      results.push(`${size.width}x${size.height}: ${name} OK`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Ler QR Code ou NFC', 'Histórico']) {
    await page.getByRole('button', { name, exact: true }).click();
    const close = page.getByRole('button', { name: 'Fechar', exact: true });
    await close.click();
    await close.waitFor({ state: 'hidden' });
    results.push(`${name} OK`);
  }
  await page.getByRole('button', { name: 'Lotes', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const close = page.getByRole('button', { name: 'Fechar', exact: true });
  await close.click();
  await close.waitFor({ state: 'hidden' });
  results.push('Ajustes OK');
  await page.getByRole('button', { name: 'Início', exact: true }).click();
  await page.waitForTimeout(500);
  await page.mouse.move(350, 380);
  await page.mouse.down();
  await page.mouse.move(40, 380, { steps: 18 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).waitFor();
  results.push('Deslize Início → Lotes OK');
  await page.screenshot({ path: '.expo/barra-corrigida.png' });
  return results;
}
