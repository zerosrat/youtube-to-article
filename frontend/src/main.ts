import './styles.css';
import { App } from './app';

const appElement = document.getElementById('app');
if (appElement) {
  new App(appElement);
}
