/**
 * html-to-pdf engine — Playwright wrapper. playwright-core is virtually mocked
 * so the suite needs no real Chromium (CI + local stay green; the real engine
 * only launches Chromium at runtime).
 */

let launchMock, page, context, browser;

function load() {
  jest.resetModules();
  page = {
    setContent: jest.fn().mockResolvedValue(),
    evaluate: jest.fn().mockResolvedValue(),
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
    $: jest.fn().mockResolvedValue(null),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('PNGfake')),
  };
  context = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue() };
  browser = {
    isConnected: jest.fn().mockReturnValue(true),
    newContext: jest.fn().mockResolvedValue(context),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(),
  };
  launchMock = jest.fn().mockResolvedValue(browser);
  jest.doMock('playwright-core', () => ({ chromium: { launch: launchMock } }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  return require('../../bot/shared/utils/html-to-pdf');
}

afterEach(() => jest.resetModules());

describe('htmlToPdf', () => {
  it('renders HTML to a PDF buffer and awaits document.fonts.ready', async () => {
    const { htmlToPdf } = load();
    const buf = await htmlToPdf('<html><body>hi</body></html>');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(page.setContent).toHaveBeenCalledTimes(1);
    expect(page.evaluate).toHaveBeenCalledTimes(1); // document.fonts.ready
    expect(page.pdf).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalled(); // context always closed
  });

  it('reuses one browser singleton across calls', async () => {
    const { htmlToPdf } = load();
    await htmlToPdf('<html></html>');
    await htmlToPdf('<html></html>');
    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it('passes A4 + printBackground pdf defaults', async () => {
    const { htmlToPdf } = load();
    await htmlToPdf('<html></html>');
    const opts = page.pdf.mock.calls[0][0];
    expect(opts.format).toBe('A4');
    expect(opts.printBackground).toBe(true);
  });

  it('closes the context even if page.pdf throws', async () => {
    const { htmlToPdf } = load();
    page.pdf.mockRejectedValueOnce(new Error('boom'));
    await expect(htmlToPdf('<html></html>')).rejects.toThrow('boom');
    expect(context.close).toHaveBeenCalled();
  });
});

describe('htmlToImage', () => {
  it('renders HTML to a PNG buffer', async () => {
    const { htmlToImage } = load();
    const buf = await htmlToImage('<div class="card">x</div>');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });
});
