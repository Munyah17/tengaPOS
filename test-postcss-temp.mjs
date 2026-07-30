import postcss from 'postcss';
import customProperties from 'postcss-custom-properties';
import fs from 'fs';

const css = fs.readFileSync('./src/index.css', 'utf8');

postcss([customProperties({ preserve: true })])
  .process(css, { from: './src/index.css' })
  .then(result => {
    console.log('SUCCESS, output length:', result.css.length);
    console.log(result.css.slice(0, 500));
  })
  .catch(err => console.error('ERROR:', err.message, err.stack));
