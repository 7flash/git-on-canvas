// Quick FPS test for WebGL benchmark
const fs = require('fs');
const path = require('path');

console.log('📊 WebGL Benchmark Quick Test\n');
console.log('Open: packages/galaxydraw/demo/cards-benchmark.html\n');
console.log('Steps:');
console.log('1. Watch DOM FPS counter (top-left) for 5 seconds');
console.log('2. Click "🔄 Switch Renderer" button');
console.log('3. Click "▶ Run" button');
console.log('4. Watch WebGL FPS for 5 seconds');
console.log('5. Compare numbers\n');
console.log('Expected Results:');
console.log('- DOM: 30-60 FPS (depends on GPU)');
console.log('- WebGL: Should be higher, especially with 200 cards\n');
console.log('If WebGL shows 50%+ improvement → Integrate into GitMaps');
console.log('If similar/slower → Skip WebGL for now\n');

// Save test template
const template = {
  testDate: new Date().toISOString(),
  cards: 200,
  domFPS: null,
  webglFPS: null,
  improvement: null,
  winner: null,
  notes: ''
};

fs.writeFileSync(
  path.join(__dirname, 'test-results.json'),
  JSON.stringify(template, null, 2)
);

console.log('💾 Template saved to test-results.json');
console.log('Fill in FPS numbers after testing!\n');
