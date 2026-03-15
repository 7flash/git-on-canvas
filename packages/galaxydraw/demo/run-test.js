const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Starting WebGL Benchmark Test...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized', '--enable-webgl']
  });
  
  const page = await browser.newPage();
  const benchmarkPath = path.join(__dirname, 'index.html');
  const fileUrl = 'file:///' + benchmarkPath.replace(/\/g, '/');
  
  console.log('Opening:', fileUrl, '\n');
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#fpsValue');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Testing DOM Renderer...');
  await new Promise(r => setTimeout(r, 3000));
  const domFPS = await page.evaluate(() => document.getElementById('fpsValue').textContent);
  console.log('DOM FPS:', domFPS, '\n');
  
  console.log('Switching to WebGL...');
  await page.click('#webglBtn');
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Testing WebGL Renderer...');
  await new Promise(r => setTimeout(r, 3000));
  const webglFPS = await page.evaluate(() => document.getElementById('fpsValue').textContent);
  console.log('WebGL FPS:', webglFPS, '\n');
  
  const domNum = parseInt(domFPS) || 0;
  const webglNum = parseInt(webglFPS) || 0;
  const improvement = domNum > 0 ? ((webglNum - domNum) / domNum * 100) : 0;
  
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log('DOM Renderer:   ', domNum, 'FPS');
  console.log('WebGL Renderer: ', webglNum, 'FPS');
  console.log('Improvement:    ', improvement.toFixed(0), '%');
  console.log('='.repeat(60));
  
  if (webglNum > domNum * 1.5) {
    console.log('WebGL is significantly faster - recommend integration');
  } else if (webglNum > domNum) {
    console.log('WebGL is slightly faster - marginal gain');
  } else {
    console.log('DOM is faster - skip WebGL integration');
  }
  
  await browser.close();
})();
