import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { createProject, getProjects, createTask, getTasks, getSessions, createSession, getTimerState, saveTimerState, listenToTimerState} from "./database.js";
import { deleteTask as deleteTaskFromFirestore } from "./database.js";

let projects = [];
let tasks = [];
let sessions = [];
let state = {
  runningTaskId: null,
  runningProjectId: null,
  startTime: null
};

let pieChart = null;
let weeklyChart = null;
let currentUser = null;
let unsubscribeTimerState = null;

const nameInput = document.getElementById("name");
const goalInput = document.getElementById("goal");
const addTaskButton = document.getElementById("addTaskButton");
const exportCSVButton = document.getElementById("exportCSVButton");
const completedTasksHeading = document.getElementById("completedTasksHeading");
const activeTasksContainer = document.getElementById("tasks");
const completedTasksContainer = document.getElementById("completedTasks");
const dashboardContainer = document.getElementById("dashboard");
const historyContainer = document.getElementById("history");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const userStatus = document.getElementById("userStatus");
const appContent = document.getElementById("appContent");
const taskProjectInput = document.getElementById("taskProjectInput");
const newProjectButton = document.getElementById("newProjectButton");
const projectFormCard = document.getElementById("projectFormCard");
const projectNameInput = document.getElementById("projectNameInput");
const projectDescriptionInput = document.getElementById("projectDescriptionInput");
const projectColorInput = document.getElementById("projectColorInput");
const projectHoursInput = document.getElementById("projectHoursInput");
const saveProjectButton = document.getElementById("saveProjectButton");
const cancelProjectButton = document.getElementById("cancelProjectButton");
const projectsContainer = document.getElementById("projectsContainer");

function startTimerStateListener() {
  if (!currentUser) return;

  if (unsubscribeTimerState) {
    unsubscribeTimerState();
    unsubscribeTimerState = null;
  }

  unsubscribeTimerState = listenToTimerState(currentUser.uid, newState => {
    state = newState;
    renderDashboard();
    renderTasks();
  }, error => {
    userStatus.textContent = "Timer synchronization failed.";
  });
}

function renderProjectOptions() {
  const activeProjects = projects.filter(project => !project.archived);
  const generalProject = activeProjects.find(project => project.name.trim().toLowerCase() === "general");

  taskProjectInput.innerHTML = activeProjects.length
    ? activeProjects.map(project => `<option value="${project.id}">${escapeHTML(project.name)}</option>`).join("")
    : `<option value="">Create a project named General first</option>`;

  taskProjectInput.disabled = activeProjects.length === 0;
  addTaskButton.disabled = activeProjects.length === 0;

  if (generalProject) {
    taskProjectInput.value = generalProject.id;
  }
}

function openProjectForm() {
  projectFormCard.hidden = false;
  projectNameInput.focus();
}

function closeProjectForm() {
  projectFormCard.hidden = true;
  projectNameInput.value = "";
  projectDescriptionInput.value = "";
  projectColorInput.value = "#4f83cc";
  projectHoursInput.value = "";
}

async function saveProject() {
  if (!currentUser) return;

  const name = projectNameInput.value.trim();
  const description = projectDescriptionInput.value.trim();
  const color = projectColorInput.value;
  const estimatedHours = projectHoursInput.value === "" ? null : Number.parseFloat(projectHoursInput.value);

  if (!name) {
    alert("Enter a project name.");
    return;
  }

  if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) {
    alert("Enter a valid estimated time.");
    return;
  }

  try {
    saveProjectButton.disabled = true;

    await createProject(currentUser.uid, {
      name,
      description,
      color,
      estimatedHours
    });

    projects = await getProjects(currentUser.uid);

    renderProjects();
    renderProjectOptions();
    closeProjectForm();
  } catch (error) {
    console.error("Failed to create project:", error);
    alert(error.message);
  } finally {
    saveProjectButton.disabled = false;
  }
}
function renderProjects() {
  const activeProjects = projects.filter(project => !project.archived);

  if (activeProjects.length === 0) {
    projectsContainer.innerHTML = `
      <section class="empty-state">
        <h3>No projects yet</h3>
        <p>Create your first project to begin organizing tasks.</p>
      </section>
    `;
    return;
  }

  projectsContainer.innerHTML = activeProjects.map(project => {
    const projectTasks = tasks.filter(task => task.projectId === project.id && !task.archived);
    const completedTasks = projectTasks.filter(task => task.completed).length;
    const estimate = project.estimatedHours !== null && project.estimatedHours !== undefined ? `${project.estimatedHours.toFixed(2)} h estimated` : "No estimate";

    return `
      <section class="card project-card" style="border-top:5px solid ${project.color}">
        <h3>${escapeHTML(project.name)}</h3>
        <p>${escapeHTML(project.description || "No description")}</p>
        <div>${projectTasks.length} tasks</div>
        <div>${completedTasks} completed</div>
        <div>${estimate}</div>
      </section>
    `;
  }).join("");
}
async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google sign-in failed:", error);
    userStatus.textContent = `Sign-in failed: ${error.message}`;
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out failed:", error);
    userStatus.textContent = `Sign-out failed: ${error.message}`;
  }
}

async function loadFirestoreData() {
  if (!currentUser) return;

  try {
    projects = await getProjects(currentUser.uid);
    tasks = await getTasks(currentUser.uid);
    sessions = await getSessions(currentUser.uid);
    sessions = sessions.map(session => ({
      ...session,
      start: session.start?.toMillis ? session.start.toMillis() : session.start,
      end: session.end?.toMillis ? session.end.toMillis() : session.end
    }));
    renderProjects();
    renderProjectOptions();
    console.log("Loaded projects:", projects);
    console.log("Loaded tasks:", tasks);
  } catch (error) {
    console.error("Failed to load Firestore data:", error);
    throw error;
  }
}

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (user) {
    userStatus.textContent = `Signed in as ${user.email}`;
    loginButton.hidden = true;
    logoutButton.hidden = false;
    appContent.hidden = false;

    try {
      await loadFirestoreData();
      startTimerStateListener();
      render();
    } catch (error) {
      console.error("Failed to initialize application:", error);
      userStatus.textContent = "Failed to load tracker data.";
      appContent.hidden = true;
    }
  } else {
    if (unsubscribeTimerState) {
      unsubscribeTimerState();
      unsubscribeTimerState = null;
    }

    projects = [];
    tasks = [];
    sessions = [];
    state = {
      runningTaskId: null,
      runningProjectId: null,
      startTime: null
    };

    currentUser = null;
    userStatus.textContent = "Not signed in";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    appContent.hidden = true;
  }
});

async function addTask() {
  if (!currentUser) return;

  const name = nameInput.value.trim();
  const generalProject = projects.find(project => !project.archived && project.name.trim().toLowerCase() === "general");
  const projectId = taskProjectInput.value || generalProject?.id;

  if (!name) {
    alert("Enter a task name.");
    return;
  }

  if (!projectId) {
    alert('Create a project named "General" first.');
    return;
  }

  try {
    await createTask(currentUser.uid, projectId, {
      name,
      description: "",
      targetHours: goalInput.value ? Number(goalInput.value) : null,
      parentTaskId: null
    });

    tasks = await getTasks(currentUser.uid);

    nameInput.value = "";
    goalInput.value = "";
    taskProjectInput.value = generalProject?.id || projectId;

    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to create task:", error);
    alert("The task could not be created.");
  }
}

async function deleteTask(id) {
  if (!currentUser) return;

  const task = tasks.find(task => task.id === id);
  if (!task) return;

  if (state.runningTaskId === id) {
    alert("Stop the running timer before deleting this task.");
    return;
  }

  if (!window.confirm(`Delete "${task.name}"?`)) return;

  try {
    await deleteTaskFromFirestore(currentUser.uid, id);
    tasks = await getTasks(currentUser.uid);
    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to delete task:", error);
    alert("The task could not be deleted.");
  }
}

async function completeTask(id) {
  const task = tasks.find(task => task.id === id);
  if (!task) return;

  if (state.runningTaskId === id) {
    await stopTask();
    if (state.runningTaskId === id) return;
  }

  task.completed = true;
  task.completedAt = Date.now();

  render();
}

function restoreTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;

  task.completed = false;
  task.completedAt = null;

  render();
}

function toggleCompleted() {
  const isHidden = completedTasksContainer.style.display === "none" || completedTasksContainer.style.display === "";

  completedTasksContainer.style.display = isHidden ? "block" : "none";
  completedTasksHeading.textContent = isHidden ? "Completed Tasks ▲" : "Completed Tasks ▼";
}

async function startTask(id) {
  const task = tasks.find(task => task.id === id);
  if (!task || task.completed || !currentUser) return;

  if (state.runningTaskId !== null) {
    await stopTask();
    if (state.runningTaskId !== null) return;
  }

  try {
    await saveTimerState(currentUser.uid, {
      runningTaskId: task.id,
      runningProjectId: task.projectId,
      startTime: Date.now()
    });
  } catch (error) {
    console.error("Failed to start timer:", error);
    alert("The timer could not be started.");
  }
}

async function stopTask() {
  if (state.runningTaskId === null || state.startTime === null || !currentUser) return;

  const endTime = Date.now();
  const task = tasks.find(task => task.id === state.runningTaskId);

  if (!task) {
    console.error("The running task could not be found.");
    return;
  }

  const project = projects.find(project => project.id === task.projectId);

  if (!project) {
    console.error("The running task's project could not be found.");
    return;
  }

  try {
    await createSession(currentUser.uid, {
      projectId: project.id,
      taskId: task.id,
      projectName: project.name,
      taskName: task.name,
      start: new Date(state.startTime),
      end: new Date(endTime),
      note: "",
      source: "timer"
    });

    const clearedState = {
      runningTaskId: null,
      runningProjectId: null,
      startTime: null
    };

    await saveTimerState(currentUser.uid, clearedState);

    sessions = await getSessions(currentUser.uid);
    sessions = sessions.map(session => ({
      ...session,
      start: session.start?.toMillis ? session.start.toMillis() : session.start,
      end: session.end?.toMillis ? session.end.toMillis() : session.end
    }));

    render();
  } catch (error) {
    console.error("Failed to stop timer:", error);
    alert("The session could not be saved. The timer is still running.");
  }
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

function getCurrentSeconds(task) {
  let seconds = task.total;

  if (state.runningTaskId === task.id && state.startTime !== null) {
    seconds += (Date.now() - state.startTime) / 1000;
  }

  return seconds;
}

function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getTodaySessions() {
  const startOfToday = getStartOfToday();
  return sessions.filter(session => session.start >= startOfToday);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDashboard() {
  const today = getTodaySessions();
  const todayHours = today.reduce((sum, session) => sum + session.duration, 0) / 3600;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekHours = sessions.filter(session => session.start >= sevenDaysAgo).reduce((sum, session) => sum + session.duration, 0) / 3600;
  const goalHours = tasks.filter(task => !task.completed).reduce((sum, task) => sum + task.goal, 0);
  const completedCount = tasks.filter(task => task.completed).length;
  const completionRate = tasks.length > 0 ? completedCount / tasks.length * 100 : 0;
  const runningTask = tasks.find(task => task.id === state.runningTaskId);

  dashboardContainer.innerHTML = `
    <div class="card"><b>Today</b><br>${todayHours.toFixed(2)} h</div>
    <div class="card"><b>This Week</b><br>${weekHours.toFixed(2)} h</div>
    <div class="card"><b>Remaining Planned</b><br>${goalHours.toFixed(2)} h</div>
    <div class="card"><b>Completed Tasks</b><br>${completedCount}/${tasks.length} (${completionRate.toFixed(1)}%)</div>
    <div class="card"><b>Running</b><br>${runningTask ? escapeHTML(runningTask.name) : "None"}</div>
  `;
}

function renderHistory() {
  const todaySessions = [...getTodaySessions()].sort((a, b) => b.start - a.start);

  if (todaySessions.length === 0) {
    historyContainer.textContent = "No sessions today";
    return;
  }

  historyContainer.innerHTML = todaySessions.map(session => {
    const startTime = new Date(session.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const endTime = new Date(session.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return `<div>${startTime} - ${endTime} - ${escapeHTML(session.taskName)} (${formatDuration(session.duration)})</div>`;
  }).join("");
}

function renderPie() {
  const totals = {};

  getTodaySessions().forEach(session => {
    totals[session.taskName] = (totals[session.taskName] || 0) + session.duration / 3600;
  });

  const labels = Object.keys(totals);
  const data = Object.values(totals);

  if (pieChart) pieChart.destroy();

  pieChart = new Chart(document.getElementById("pie"), {
    type: "pie",
    data: {
      labels,
      datasets: [{ data }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: labels.length > 0
        }
      }
    }
  });
}

function getLastSevenDays() {
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    days.push(date);
  }

  return days;
}

function renderWeekly() {
  const days = getLastSevenDays();
  const labels = days.map(date => date.toLocaleDateString(undefined, { weekday: "short" }));

  const data = days.map(date => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    return sessions
      .filter(session => session.start >= date.getTime() && session.start < nextDate.getTime())
      .reduce((sum, session) => sum + session.duration, 0) / 3600;
  });

  if (weeklyChart) weeklyChart.destroy();

  weeklyChart = new Chart(document.getElementById("weekly"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Hours",
        data
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Hours"
          }
        }
      }
    }
  });
}

function createTaskElement(task) {
  const project = projects.find(project => project.id === task.projectId);
  const projectLabel = project ? `<div class="task-project"><span style="background:${project.color}"></span>${escapeHTML(project.name)}</div>` : "";

  const seconds = getCurrentSeconds(task);
  const targetHours = task.targetHours ?? 0;
  const goalSeconds = targetHours * 3600;
  const percentage = goalSeconds > 0 ? seconds / goalSeconds * 100 : 0;
  const differenceHours = goalSeconds > 0 ? (seconds - goalSeconds) / 3600 : null;
  const taskElement = document.createElement("div");

  taskElement.className = [
    "card",
    "task",
    state.runningTaskId === task.id ? "running" : "",
    task.completed ? "completed" : ""
  ].filter(Boolean).join(" ");

  const timerButton = task.completed
    ? ""
    : state.runningTaskId === task.id
      ? `<button type="button" data-action="stop">Stop</button>`
      : `<button type="button" data-action="start" data-task-id="${task.id}">Start</button>`;

  const completionButton = task.completed
    ? `<button type="button" data-action="restore" data-task-id="${task.id}">Restore</button>`
    : `<button type="button" data-action="complete" data-task-id="${task.id}">Complete</button>`;

  const targetDisplay = task.targetHours !== null && task.targetHours !== undefined
    ? `<div>Target: ${task.targetHours.toFixed(2)} h</div>`
    : `<div>Target: None</div>`;

  const progressDisplay = goalSeconds > 0
    ? `
      <div>${differenceHours >= 0 ? `Overrun: +${differenceHours.toFixed(2)} h` : `Remaining: ${Math.abs(differenceHours).toFixed(2)} h`}</div>
      <div>${percentage.toFixed(1)}%</div>
      <div class="progress"><div class="bar" style="width:${Math.min(percentage, 100)}%"></div></div>
    `
    : "";

  taskElement.innerHTML = `
    ${projectLabel}
    <h3>${escapeHTML(task.name)}</h3>
    ${targetDisplay}
    <div>Tracked: ${formatDuration(seconds)}</div>
    ${progressDisplay}
    ${task.completedAt ? `<div class="small">Completed: ${task.completedAt.toDate ? task.completedAt.toDate().toLocaleDateString() : new Date(task.completedAt).toLocaleDateString()}</div>` : ""}
    <br>
    ${timerButton}
    ${completionButton}
    <button type="button" data-action="delete" data-task-id="${task.id}">Delete</button>
  `;

  return taskElement;
}

function renderTasks() {
  activeTasksContainer.innerHTML = "";
  completedTasksContainer.innerHTML = "";

  tasks.forEach(task => {
    const taskElement = createTaskElement(task);

    if (task.completed) {
      completedTasksContainer.appendChild(taskElement);
    } else {
      activeTasksContainer.appendChild(taskElement);
    }
  });
}

function exportCSV() {
  let csv = "Task,Start,End,Hours\n";

  sessions.forEach(session => {
    const safeTaskName = String(session.taskName).replaceAll('"', '""');
    csv += `"${safeTaskName}","${new Date(session.start).toISOString()}","${new Date(session.end).toISOString()}",${(session.duration / 3600).toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const downloadLink = document.createElement("a");
  const objectURL = URL.createObjectURL(blob);

  downloadLink.href = objectURL;
  downloadLink.download = "sessions.csv";
  downloadLink.click();

  URL.revokeObjectURL(objectURL);
}

async function handleTaskAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;

  switch (action) {
    case "start":
      await startTask(taskId);
      break;
    case "stop":
      await stopTask();
      break;
    case "complete":
      await completeTask(taskId);
      break;
    case "restore":
      restoreTask(taskId);
      break;
    case "delete":
      deleteTask(taskId);
      break;
  }
}

function render() {
  renderDashboard();
  renderTasks();
  renderHistory();
  renderPie();
  renderWeekly();
}

addTaskButton.addEventListener("click", addTask);
exportCSVButton.addEventListener("click", exportCSV);
completedTasksHeading.addEventListener("click", toggleCompleted);
activeTasksContainer.addEventListener("click", handleTaskAction);
completedTasksContainer.addEventListener("click", handleTaskAction);
loginButton.addEventListener("click", loginWithGoogle);
logoutButton.addEventListener("click", logoutUser);

nameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addTask();
});

goalInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addTask();
});

setInterval(() => {
    if (!currentUser) return;
    renderDashboard();
    renderTasks();
  }, 1000);

const navButtons = document.querySelectorAll(".nav-button");
const appViews = document.querySelectorAll(".app-view");

navButtons.forEach(button => {
  button.addEventListener("click", () => {
    navButtons.forEach(item => item.classList.remove("active"));
    appViews.forEach(view => view.hidden = true);

    button.classList.add("active");
    document.getElementById(button.dataset.view).hidden = false;
  });
});
newProjectButton.addEventListener("click", openProjectForm);
cancelProjectButton.addEventListener("click", closeProjectForm);
saveProjectButton.addEventListener("click", saveProject);
projectNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveProject();
});