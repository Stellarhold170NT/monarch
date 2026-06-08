import('js-tiktoken').then(m => {
  console.log('OK:', Object.keys(m).join(', '));
  const enc = m.getEncoding('cl100k_base');
  const tokens = enc.encode('hello world');
  console.log('encode test:', tokens.length, 'tokens');
}).catch(e => console.error('FAIL:', e.message));
