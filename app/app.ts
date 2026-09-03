import { mount } from 'svelte'
import App from './App.svelte'
import DiffPage from './DiffPage.svelte'
import ScrollTestPage from './ScrollTestPage.svelte'
import ModalTestPage from './ModalTestPage.svelte'

const routes: [string, typeof App][] = [
  ['/diff', DiffPage],
  ['/scroll-test', ScrollTestPage],
  ['/modal-test', ModalTestPage],
]

const path = window.location.pathname
const page = routes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? App

const app = mount(page, {
  target: document.getElementById('app')!,
})

export default app