(() => {
  
  const app = document.getElementById('app');
  const noticeEl = document.getElementById('notice');

  
  let useFirebase = false;
  let currentUser = null;            
  let tasks = [];                    
  let editingTaskId = null;
  let editForm = { title: '', description: '' };

  
  let firebaseAuth = null;
  let firebaseDB = null;
  let unsubscribeTasksListener = null;

  
  const showNotice = (text, type='notice') => {
    noticeEl.style.display = 'block';
    noticeEl.className = type;
    noticeEl.textContent = text;
    if(type === 'notice'){
      setTimeout(()=> { noticeEl.style.display='none'; noticeEl.className='notice'; noticeEl.textContent=''; }, 6000);
    }
  };

  const clearNotice = () => { noticeEl.style.display='none'; noticeEl.textContent=''; noticeEl.className='notice'; };

  const formatDateTime = (d) => {
    try {
      const date = new Date(d);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    } catch {
      return String(d);
    }
  };

  

  async function initBackendIfConfigured(){
    const cfg = window.FIREBASE_CONFIG || {};
    const probablyConfigured = cfg.apiKey && cfg.apiKey !== 'REPLACE_WITH_YOUR_API_KEY' && cfg.projectId && cfg.projectId !== 'REPLACE_WITH_PROJECT_ID';

    if(!probablyConfigured){
      useFirebase = false;
      showNotice('Firebase config not provided — running in local mock mode (no cloud).', 'notice');
      return;
    }

    
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      const {
        getFirestore, collection, query, where, orderBy, onSnapshot,
        addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs
      } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      const app = initializeApp(cfg);
      firebaseAuth = getAuth(app);
      firebaseDB = getFirestore(app);

      
      onAuthStateChanged(firebaseAuth, (user) => {
        if(user){
          
          currentUser = { uid: user.uid, name: user.displayName || user.email?.split('@')[0] || 'User', email: user.email };
          startRealtimeTasksListener();
        } else {
          currentUser = null;
          stopRealtimeTasksListener();
          tasks = [];
        }
        render();
      });

      
      window.__FIREBASE__ = { firebaseAuth, firebaseDB, helpers: { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } };

      useFirebase = true;
      showNotice('Firebase initialized — using Firestore + Authentication.', 'success');
    } catch (err) {
      console.error('Firebase init failed:', err);
      useFirebase = false;
      showNotice('Failed to init Firebase — running in local mock mode. Check console for details.', 'error');
    }
  }

  

  
  const DEMO_EMAIL = 'nishnath@example.com';
  const DEMO_PW = 'password123';

  function mockSignIn(email, password){
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if(email === DEMO_EMAIL && password === DEMO_PW){
          const user = { uid: 'demo-1', name: 'Nishnath', email };
          localStorage.setItem('mock_current_user', JSON.stringify(user));
          resolve(user);
        } else {
          reject(new Error('Invalid demo credentials. Use nishnath@example.com / password123 or sign up.'));
        }
      }, 600);
    });
  }

  function mockSignUp(name, email, password){
    return new Promise((resolve) => {
      setTimeout(() => {
        const user = { uid: 'mock-' + Date.now().toString(), name, email };
        localStorage.setItem('mock_current_user', JSON.stringify(user));
        resolve(user);
      }, 600);
    });
  }

  function mockSignOut(){
    localStorage.removeItem('mock_current_user');
    return Promise.resolve();
  }

  function mockLoadTasksFor(uid){
    const all = JSON.parse(localStorage.getItem('mock_tasks') || '[]');
    return Promise.resolve(all.filter(t => t.uid === uid));
  }

  function mockAddTaskFor(uid, payload){
    const all = JSON.parse(localStorage.getItem('mock_tasks') || '[]');
    const newTask = {
      id: 'm-' + Date.now().toString(),
      uid,
      title: payload.title,
      description: payload.description || '',
      completed: false,
      createdAt: new Date().toISOString()
    };
    all.push(newTask);
    localStorage.setItem('mock_tasks', JSON.stringify(all));
    return Promise.resolve(newTask);
  }

  function mockUpdateTask(id, updates){
    const all = JSON.parse(localStorage.getItem('mock_tasks') || '[]');
    const updated = all.map(t => t.id === id ? { ...t, ...updates } : t);
    localStorage.setItem('mock_tasks', JSON.stringify(updated));
    return Promise.resolve(updated.find(t => t.id === id));
  }

  function mockDeleteTask(id){
    const all = JSON.parse(localStorage.getItem('mock_tasks') || '[]');
    const filtered = all.filter(t => t.id !== id);
    localStorage.setItem('mock_tasks', JSON.stringify(filtered));
    return Promise.resolve();
  }

  

  function startRealtimeTasksListener(){
    if(!useFirebase || !currentUser) return;
    try {
      const { firebaseDB } = window.__FIREBASE__.firebaseDB ? { firebaseDB: window.__FIREBASE__.firebaseDB } : { firebaseDB: window.__FIREBASE__.firebaseDB };
      const { collection, query, where, orderBy, onSnapshot } = window.__FIREBASE__.helpers;

      
      const tasksQuery = query(collection(firebaseDB, 'tasks'), where('uid','==', currentUser.uid), orderBy('createdAt','desc'));
      unsubscribeTasksListener = onSnapshot(tasksQuery, snapshot => {
        tasks = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            uid: data.uid,
            title: data.title,
            description: data.description || '',
            completed: !!data.completed,
            
            createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
          };
        });
        render(); 
      }, err => {
        console.error('Task listener error', err);
        showNotice('Failed to listen to tasks — check console.', 'error');
      });

    } catch (err) {
      console.error('startRealtimeTasksListener error', err);
    }
  }

  function stopRealtimeTasksListener(){
    try {
      if(typeof unsubscribeTasksListener === 'function') unsubscribeTasksListener();
      unsubscribeTasksListener = null;
    } catch(e){
      console.warn(e);
    }
  }

  

  async function unifiedSignIn(email, password){
    if(useFirebase){
      try {
        const { signInWithEmailAndPassword } = window.__FIREBASE__.helpers;
        const cred = await signInWithEmailAndPassword(window.__FIREBASE__.firebaseAuth, email, password);
        
        return cred.user;
      } catch(err){
        throw err;
      }
    } else {
      return mockSignIn(email, password);
    }
  }

  async function unifiedSignUp(name, email, password){
    if(useFirebase){
      try {
        const { createUserWithEmailAndPassword } = window.__FIREBASE__.helpers;
        const cred = await createUserWithEmailAndPassword(window.__FIREBASE__.firebaseAuth, email, password);
        
        const { addDoc, collection } = window.__FIREBASE__.helpers;
        await addDoc(collection(window.__FIREBASE__.firebaseDB, 'users'), { uid: cred.user.uid, name, email });
        return cred.user;
      } catch(err){
        throw err;
      }
    } else {
      return mockSignUp(name, email, password);
    }
  }

  async function unifiedSignOut(){
    if(useFirebase){
      const { signOut } = window.__FIREBASE__.helpers;
      await signOut(window.__FIREBASE__.firebaseAuth);
      currentUser = null;
    } else {
      await mockSignOut();
      currentUser = null;
    }
    tasks = [];
    render();
  }

  async function unifiedLoadTasks(){
    if(useFirebase){
      
      try {
        const { getDocs, collection, query, where, orderBy } = window.__FIREBASE__.helpers;
        const q = query(collection(window.__FIREBASE__.firebaseDB,'tasks'), where('uid','==', currentUser.uid), orderBy('createdAt','desc'));
        const snapshot = await getDocs(q);
        tasks = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            uid: d.uid,
            title: d.title,
            description: d.description || '',
            completed: !!d.completed,
            createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : (d.createdAt || new Date().toISOString())
          };
        });
        render();
      } catch(err){
        console.error(err);
      }
    } else {
      tasks = await mockLoadTasksFor(currentUser.uid);
      render();
    }
  }

  async function unifiedCreateTask(payload){
    if(useFirebase){
      const { addDoc, collection, serverTimestamp } = window.__FIREBASE__.helpers;
      const docRef = await addDoc(collection(window.__FIREBASE__.firebaseDB,'tasks'), {
        uid: currentUser.uid,
        title: payload.title,
        description: payload.description || '',
        completed: false,
        createdAt: serverTimestamp()
      });
      
      return docRef.id;
    } else {
      const newTask = await mockAddTaskFor(currentUser.uid, payload);
      tasks.unshift(newTask);
      render();
      return newTask.id;
    }
  }

  async function unifiedUpdateTask(id, updates){
    if(useFirebase){
      const { updateDoc, doc } = window.__FIREBASE__.helpers;
      await updateDoc(doc(window.__FIREBASE__.firebaseDB,'tasks', id), updates);
      return;
    } else {
      await mockUpdateTask(id, updates);
      tasks = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
      render();
    }
  }

  async function unifiedDeleteTask(id){
    if(useFirebase){
      const { deleteDoc, doc } = window.__FIREBASE__.helpers;
      await deleteDoc(doc(window.__FIREBASE__.firebaseDB,'tasks', id));
      return;
    } else {
      await mockDeleteTask(id);
      tasks = tasks.filter(t => t.id !== id);
      render();
    }
  }

  

  function render(){
    clearNotice();
    app.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'container';

    if(!currentUser){
      renderAuth(container);
    } else {
      renderTaskManager(container);
    }

    app.appendChild(container);
  }

  

  function renderAuth(root){
    const card = document.createElement('div');
    card.className = 'card auth-card';

    card.innerHTML = `
      <div style="text-align:center;margin-bottom:12px">
        <h2 style="margin:0 0 6px">TaskFlow — Sign In</h2>
        <div style="color:#6b7280">Use Firebase auth if configured, otherwise mock local login/signup</div>
      </div>
      <div id="auth-error" style="display:none" class="error"></div>
      <div id="auth-forms">
        <div id="login-view">
          <form id="login-form">
            <label>Email</label>
            <input id="login-email" type="email" required placeholder="you@example.com" />
            <label style="margin-top:8px">Password</label>
            <input id="login-password" type="password" required placeholder="password" />
            <div style="margin-top:12px;display:flex;gap:8px">
              <button type="submit">Sign In</button>
              <button type="button" class="ghost" id="switch-signup">Sign up</button>
            </div>
          </form>
          <div style="margin-top:10px;color:#6b7280;font-size:13px">Demo credentials (mock): <kbd>nishnath@example.com</kbd> / <kbd>password123</kbd></div>
        </div>
      </div>
    `;

    root.appendChild(card);

    const loginForm = card.querySelector('#login-form');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = card.querySelector('#login-email').value.trim();
      const password = card.querySelector('#login-password').value.trim();
      try {
        const res = await unifiedSignIn(email, password);
        
        if(!useFirebase){
          currentUser = res;
        }
        
        if(!useFirebase) {
          await unifiedLoadTasks();
          render();
          showNotice('Signed in (mock)', 'success');
        }
      } catch(err){
        const errEl = card.querySelector('#auth-error');
        errEl.style.display = 'block';
        errEl.textContent = err.message || 'Sign in failed';
        setTimeout(()=> errEl.style.display='none', 5000);
      }
    });

    card.querySelector('#switch-signup').addEventListener('click', () => {
      renderSignup(root);
    });
  }

  function renderSignup(root){
    root.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'card auth-card';

    card.innerHTML = `
      <div style="text-align:center;margin-bottom:12px">
        <h2 style="margin:0 0 6px">Create Account</h2>
        <div style="color:#6b7280">Sign up with email & password</div>
      </div>
      <div id="signup-error" style="display:none" class="error"></div>
      <form id="signup-form">
        <label>Full name</label>
        <input id="signup-name" type="text" required placeholder="Your name" />
        <label style="margin-top:8px">Email</label>
        <input id="signup-email" type="email" required placeholder="you@example.com" />
        <label style="margin-top:8px">Password</label>
        <input id="signup-password" type="password" required placeholder="password" />
        <div style="margin-top:12px;display:flex;gap:8px">
          <button type="submit">Create Account</button>
          <button type="button" class="ghost" id="switch-signin">Back to sign in</button>
        </div>
      </form>
    `;

    root.appendChild(card);

    card.querySelector('#signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = card.querySelector('#signup-name').value.trim();
      const email = card.querySelector('#signup-email').value.trim();
      const password = card.querySelector('#signup-password').value.trim();
      try {
        const res = await unifiedSignUp(name, email, password);
        if(!useFirebase){
          currentUser = res;
          await unifiedLoadTasks();
          render();
          showNotice('Account created (mock).', 'success');
        } else {
          showNotice('Account created. Signed in with Firebase.', 'success');
        }
      } catch(err){
        const errEl = card.querySelector('#signup-error');
        errEl.style.display = 'block';
        errEl.textContent = err.message || 'Signup failed';
        setTimeout(()=> errEl.style.display='none', 5000);
      }
    });

    card.querySelector('#switch-signin').addEventListener('click', () => {
      render();
    });
  }

  

  function renderTaskManager(root){
    const headerCard = document.createElement('div');
    headerCard.className = 'card header';
    const userName = currentUser?.name || currentUser?.email || 'User';
    headerCard.innerHTML = `
      <div>
        <div class="title">TaskFlow Manager</div>
        <div class="sub">Welcome back, ${userName}</div>
      </div>
      <div class="row">
        <div style="padding:8px 12px;background:white;border-radius:999px;display:flex;gap:8px;align-items:center;box-shadow:0 4px 10px rgba(12,20,54,0.06)">
          <strong>${userName}</strong>
        </div>
        <button class="outline" id="btn-logout">Logout</button>
      </div>
    `;
    root.appendChild(headerCard);

    headerCard.querySelector('#btn-logout').addEventListener('click', async () => {
      await unifiedSignOut();
      showNotice('Signed out', 'notice');
      render();
    });

    
    const statsCard = document.createElement('div');
    statsCard.className = 'stats-grid';
    statsCard.innerHTML = `
      <div class="card stat"><div><div class="label">Pending Tasks</div><div class="num">${tasks.filter(t=>!t.completed).length}</div></div></div>
      <div class="card stat"><div><div class="label">Completed Tasks</div><div class="num">${tasks.filter(t=>t.completed).length}</div></div></div>
      <div class="card stat"><div><div class="label">Total Tasks</div><div class="num">${tasks.length}</div></div></div>
    `;
    root.appendChild(statsCard);

    
    const addCard = document.createElement('div');
    addCard.className = 'card';
    addCard.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">Create New Task</h3>
      </div>
      <form id="add-task-form" class="row" style="flex-direction:column">
        <div style="width:100%">
          <label>Title</label>
          <input id="new-title" type="text" placeholder="What needs to be done?" required />
        </div>
        <div style="width:100%">
          <label style="margin-top:8px">Description</label>
          <textarea id="new-desc" placeholder="Add details..." style="min-height:80px"></textarea>
        </div>
        <div style="margin-top:10px">
          <button type="submit"><span style="font-weight:700">+ Add Task</span></button>
        </div>
      </form>
    `;
    root.appendChild(addCard);

    addCard.querySelector('#add-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = addCard.querySelector('#new-title').value.trim();
      const desc = addCard.querySelector('#new-desc').value.trim();
      if(!title) return showNotice('Task title required', 'error');
      await unifiedCreateTask({ title, description: desc });
      addCard.querySelector('#new-title').value = '';
      addCard.querySelector('#new-desc').value = '';
      if(!useFirebase) render(); 
      else showNotice('Task added', 'success');
    });

    
    const listCard = document.createElement('div');
    listCard.className = 'card';
    listCard.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0">Your Tasks</h3><div style="color:#6b7280">${tasks.length} tasks</div></div>`;
    root.appendChild(listCard);

    if(tasks.length === 0){
      const empty = document.createElement('div');
      empty.className = 'empty center';
      empty.innerHTML = `<div style="font-weight:600;margin-bottom:6px">No tasks yet</div><div style="color:var(--muted)">Add your first task using the form above</div>`;
      listCard.appendChild(empty);
    } else {
      tasks.forEach(task => {
        const tCard = document.createElement('div');
        tCard.className = 'task' + (task.completed ? ' completed' : '');
        const left = document.createElement('div');
        left.className = 'left';
        const actions = document.createElement('div');
        actions.className = 'actions';

        if(editingTaskId === task.id){
          
          const editBox = document.createElement('div');
          editBox.className = 'inline-edit';
          const it = document.createElement('input');
          it.value = editForm.title;
          const idesc = document.createElement('textarea');
          idesc.value = editForm.description;
          editBox.appendChild(it);
          editBox.appendChild(idesc);

          const btnSave = document.createElement('button');
          btnSave.textContent = 'Save';
          btnSave.addEventListener('click', async () => {
            const newTitle = it.value.trim();
            const newDesc = idesc.value.trim();
            if(!newTitle) return showNotice('Title required', 'error');
            await unifiedUpdateTask(task.id, { title: newTitle, description: newDesc });
            editingTaskId = null;
            editForm = { title:'', description:'' };
            if(!useFirebase) render();
          });

          const btnCancel = document.createElement('button');
          btnCancel.className = 'ghost';
          btnCancel.textContent = 'Cancel';
          btnCancel.addEventListener('click', () => {
            editingTaskId = null;
            editForm = { title:'', description:'' };
            render();
          });

          actions.appendChild(btnSave);
          actions.appendChild(btnCancel);
          left.appendChild(editBox);
        } else {
          
          const titleEl = document.createElement('div');
          titleEl.innerHTML = `<h3>${escapeHtml(task.title)}</h3>` + (task.description ? `<p>${escapeHtml(task.description)}</p>` : '');
          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.innerHTML = `<div>Created: ${formatDateTime(task.createdAt)}</div>`;
          titleEl.appendChild(meta);
          left.appendChild(titleEl);

          
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'small';
          toggleBtn.textContent = task.completed ? 'Undo' : 'Done';
          toggleBtn.addEventListener('click', async () => {
            await unifiedUpdateTask(task.id, { completed: !task.completed });
            if(!useFirebase) render();
          });

          const editBtn = document.createElement('button');
          editBtn.className = 'ghost small';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', () => {
            editingTaskId = task.id;
            editForm = { title: task.title, description: task.description };
            render();
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'ghost small';
          delBtn.textContent = 'Delete';
          delBtn.addEventListener('click', async () => {
            if(!confirm('Delete this task?')) return;
            await unifiedDeleteTask(task.id);
            if(!useFirebase) render();
          });

          actions.appendChild(toggleBtn);
          actions.appendChild(editBtn);
          actions.appendChild(delBtn);
        }

        tCard.appendChild(left);
        tCard.appendChild(actions);
        listCard.appendChild(tCard);
      });
    }
  }

  
  function escapeHtml(s=''){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;')
      .replace(/\n/g,'<br/>');
  }

  

  (async function startup(){
    
    await initBackendIfConfigured();

    
    if(useFirebase){
      
      
      render();
    } else {
      
      const mockUser = localStorage.getItem('mock_current_user');
      if(mockUser){
        currentUser = JSON.parse(mockUser);
        tasks = await mockLoadTasksFor(currentUser.uid);
      }
      render();
    }
  })();

})();
