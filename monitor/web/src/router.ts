import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/clients',
    },
    {
      path: '/clients',
      name: 'clients',
      component: () => import('./components/ClientsPage.vue'),
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: () => import('./components/TasksPage.vue'),
    },
  ],
})

export default router
