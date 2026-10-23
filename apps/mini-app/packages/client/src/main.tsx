import { render } from 'preact';
import { App } from './App';
import { start } from './store';
import './styles.css';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

render(<App />, document.getElementById('app')!);
void start();
