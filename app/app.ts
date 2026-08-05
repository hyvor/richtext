import { mount } from 'svelte'
import App from './App.svelte'
import DiffPage from './DiffPage.svelte'

const isDiffPage = window.location.pathname.startsWith('/diff')

const app = mount(isDiffPage ? DiffPage : App, {
  target: document.getElementById('app')!,
})

export default app