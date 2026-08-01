window.PUBLIC_SNAPSHOT = 'snapshot.9b700fb885085195.json';
const restoredScript = document.createElement('script');
restoredScript.src = 'https://raw.githubusercontent.com/mahaizhe-dev/mhxy/b6225a80da20307910aafbd203a3d0af87657484/app.js';
restoredScript.onerror = () => document.querySelector('#toast')?.classList.add('show');
document.head.append(restoredScript);
