import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
let sessions = JSON.parse(localStorage.getItem("sessions") || "[]");
let state = JSON.parse(localStorage.getItem("state") || '{"runningTaskId":null,"startTime":null}');

let pieChart = null;
let weeklyChart = null;
let currentUser = null;

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

function save() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
  localStorage.setItem("sessions", JSON.stringify(sessions));
  localStorage.setItem("state", JSON.stringify(state));
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

async function testFirestoreConnection() {
  if (!currentUser) return;

  try {
    await setDoc(doc(db, "users", currentUser.uid, "app", "connectionTest"), {
      message: "Firestore connection successful",
      timestamp: Date.now()
    });

    console.log("Firestore test write succeeded.");
  } catch (error) {
    console.error("Firestore test write failed:", error);
  }
}

onAuthStateChanged(auth, user => {
  currentUser = user;

  if (user) {
    userStatus.textContent = `Signed in as ${user.email}`;
    loginButton.hidden = true;
    logoutButton.hidden = false;
    appContent.hidden = false;
    console.log("Firebase user UID:", user.uid);
    testFirestoreConnection();
    render();
  } else {
    userStatus.textContent = "Not signed in";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    appContent.hidden = true;
  }
});

function addTask() {
  const name = nameInput.value.trim();
  const goal = Number.parseFloat(goalInput.value);

  if (!name) {
    alert("Enter a task name.");
    return;
  }

  if (!Number.isFinite(goal) || goal <= 0) {
    alert("Enter a target greater than zero.");
    return;
  }

  tasks.push({
    id: Date.now(),
    name,
    goal,
    total: 0,
    completed: false,
    completedAt: null
  });

  nameInput.value = "";
  goalInput.value = "";

  save();
  render();
}

function deleteTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;

  const confirmed = window.confirm(`Delete "${task.name}"?`);
  if (!confirmed) return;

  if (state.runningTaskId === id) {
    state.runningTaskId = null;
    state.startTime = null;
  }

  tasks = tasks.filter(item => item.id !== id);

  save();
  render();
}

function completeTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;

  if (state.runningTaskId === id) stopTask();

  task.completed = true;
  task.completedAt = Date.now();

  save();
  render();
}

function restoreTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task) return;

  task.completed = false;
  task.completedAt = null;

  save();
  render();
}

function toggleCompleted() {
  const isHidden = completedTasksContainer.style.display === "none" || completedTasksContainer.style.display === "";

  completedTasksContainer.style.display = isHidden ? "block" : "none";
  completedTasksHeading.textContent = isHidden ? "Completed Tasks ▲" : "Completed Tasks ▼";
}

function startTask(id) {
  const task = tasks.find(item => item.id === id);
  if (!task || task.completed) return;

  if (state.runningTaskId !== null) stopTask();

  state.runningTaskId = id;
  state.startTime = Date.now();

  save();
  render();
}

function stopTask() {
  if (state.runningTaskId === null || state.startTime === null) return;

  const endTime = Date.now();
  const duration = (endTime - state.startTime) / 1000;
  const task = tasks.find(item => item.id === state.runningTaskId);

  if (task) {
    task.total += duration;

    sessions.push({
      id: endTime,
      taskId: task.id,
      taskName: task.name,
      start: state.startTime,
      end: endTime,
      duration
    });
  }

  state.runningTaskId = null;
  state.startTime = null;

  save();
  render();
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
  const seconds = getCurrentSeconds(task);
  const goalSeconds = task.goal * 3600;
  const percentage = goalSeconds > 0 ? seconds / goalSeconds * 100 : 0;
  const differenceHours = (seconds - goalSeconds) / 3600;
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

  taskElement.innerHTML = `
    <h3>${escapeHTML(task.name)}</h3>
    <div>Goal: ${task.goal.toFixed(2)} h</div>
    <div>Tracked: ${formatDuration(seconds)}</div>
    <div>${differenceHours >= 0 ? `Overrun: +${differenceHours.toFixed(2)} h` : `Remaining: ${Math.abs(differenceHours).toFixed(2)} h`}</div>
    <div>${percentage.toFixed(1)}%</div>
    <div class="progress"><div class="bar" style="width:${Math.min(percentage, 100)}%"></div></div>
    ${task.completedAt ? `<div class="small">Completed: ${new Date(task.completedAt).toLocaleDateString()}</div>` : ""}
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

function handleTaskAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const taskId = Number(button.dataset.taskId);

  switch (action) {
    case "start":
      startTask(taskId);
      break;
    case "stop":
      stopTask();
      break;
    case "complete":
      completeTask(taskId);
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

