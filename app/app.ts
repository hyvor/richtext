import { mount } from 'svelte'
import App from './App.svelte'
import DiffPage from './DiffPage.svelte'
import ScrollTestPage from './ScrollTestPage.svelte'

const isDiffPage = window.location.pathname.startsWith('/diff')
const isScrollTestPage = window.location.pathname.startsWith('/scroll-test')

const page = isDiffPage ? DiffPage : isScrollTestPage ? ScrollTestPage : App

const app = mount(page, {
  target: document.getElementById('app')!,
})

export default app