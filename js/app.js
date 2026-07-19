import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase.js";
import {  createProject, getProjects, deleteProjectAndData, updateProject as updateProjectInFirestore, archiveProject as archiveProjectInFirestore, restoreProject as restoreProjectInFirestore,
          createTask, getTasks, completeTask as completeTaskInFirestore, reopenTask, deleteTask as deleteTaskFromFirestore, deleteSessionsByTask,
          getSessions, createSession, 
          saveTimerState, listenToTimerState } from "./database.js";

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
let editingProjectId = null;

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
const addManualSessionButton = document.getElementById("addManualSessionButton");
const manualSessionForm = document.getElementById("manualSessionForm");
const manualSessionProjectInput = document.getElementById("manualSessionProjectInput");
const manualSessionTaskInput = document.getElementById("manualSessionTaskInput");
const manualSessionStartInput = document.getElementById("manualSessionStartInput");
const manualSessionEndInput = document.getElementById("manualSessionEndInput");
const manualSessionNoteInput = document.getElementById("manualSessionNoteInput");
const saveManualSessionButton = document.getElementById("saveManualSessionButton");
const cancelManualSessionButton = document.getElementById("cancelManualSessionButton");

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function renderManualSessionProjectOptions() {
  const activeProjects = projects.filter(project => !project.archived);

  manualSessionProjectInput.innerHTML = activeProjects.length
    ? activeProjects.map(project => `<option value="${project.id}">${escapeHTML(project.name)}</option>`).join("")
    : `<option value="">No active projects</option>`;

  const generalProject = activeProjects.find(project => project.name.trim().toLowerCase() === "general");

  if (generalProject) manualSessionProjectInput.value = generalProject.id;

  renderManualSessionTaskOptions();
}

function renderManualSessionTaskOptions() {
  const projectId = manualSessionProjectInput.value;
  const projectTasks = tasks.filter(task => task.projectId === projectId && !task.archived);

  manualSessionTaskInput.innerHTML = projectTasks.length
    ? projectTasks.map(task => `<option value="${task.id}">${escapeHTML(task.name)}</option>`).join("")
    : `<option value="">No tasks available</option>`;

  manualSessionTaskInput.disabled = projectTasks.length === 0;
  saveManualSessionButton.disabled = projectTasks.length === 0;
}
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

function getCompletedTimestamp(task) {
  if (task.completedAt?.toMillis) return task.completedAt.toMillis();

  const timestamp = Number(task.completedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
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

function openProjectForm(project = null) {
  editingProjectId = project?.id || null;
  projectNameInput.value = project?.name || "";
  projectDescriptionInput.value = project?.description || "";
  projectColorInput.value = project?.color || "#4f83cc";
  projectHoursInput.value = project?.estimatedHours ?? "";
  saveProjectButton.textContent = editingProjectId ? "Save Changes" : "Create Project";
  projectFormCard.hidden = false;
  projectNameInput.focus();
}

function closeProjectForm() {
  editingProjectId = null;
  projectFormCard.hidden = true;
  projectNameInput.value = "";
  projectDescriptionInput.value = "";
  projectColorInput.value = "#4f83cc";
  projectHoursInput.value = "";
  saveProjectButton.textContent = "Create Project";
}
function editProject(projectId) {
  const project = projects.find(project => project.id === projectId);
  if (!project) return;
  openProjectForm(project);
}

async function deleteProject(projectId) {
  if (!currentUser) return;

  const project = projects.find(project => project.id === projectId);
  if (!project) return;

  if (project.name.trim().toLowerCase() === "general") {
    alert('The "General" project cannot be deleted because it is the default project.');
    return;
  }

  const runningTask = tasks.find(task => task.id === state.runningTaskId);

  if (runningTask?.projectId === projectId) {
    alert("Stop the running task before deleting this project.");
    return;
  }

  const projectTaskCount = tasks.filter(task => task.projectId === projectId).length;
  const projectSessionCount = sessions.filter(session => session.projectId === projectId).length;

  const confirmed = window.confirm(
    `Permanently delete "${project.name}"?\n\n` +
    `This will also delete ${projectTaskCount} task${projectTaskCount === 1 ? "" : "s"} and ` +
    `${projectSessionCount} tracked session${projectSessionCount === 1 ? "" : "s"}.\n\n` +
    `This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await deleteProjectAndData(currentUser.uid, projectId);

    projects = await getProjects(currentUser.uid);
    tasks = await getTasks(currentUser.uid);
    sessions = normalizeSessions(await getSessions(currentUser.uid));

    renderProjects();
    renderProjectOptions();
    render();
  } catch (error) {
    console.error("Failed to delete project:", error);
    alert("The project could not be deleted.");
  }
}

async function archiveProject(projectId) {
  if (!currentUser) return;

  const project = projects.find(project => project.id === projectId);
  if (!project) return;

  if (project.name.trim().toLowerCase() === "general") {
    alert('The "General" project cannot be archived because it is the default project.');
    return;
  }

  const runningTask = tasks.find(task => task.id === state.runningTaskId);

  if (runningTask?.projectId === projectId) {
    alert("Stop the running task before archiving this project.");
    return;
  }

  if (!window.confirm(`Archive "${project.name}"? Existing tasks and time history will be preserved.`)) return;

  try {
    await archiveProjectInFirestore(currentUser.uid, projectId);
    projects = await getProjects(currentUser.uid);
    renderProjects();
    renderProjectOptions();
    renderTasks();
  } catch (error) {
    console.error("Failed to archive project:", error);
    alert("The project could not be archived.");
  }
}

async function restoreProject(projectId) {
  if (!currentUser) return;

  try {
    await restoreProjectInFirestore(currentUser.uid, projectId);
    projects = await getProjects(currentUser.uid);
    renderProjects();
    renderProjectOptions();
    renderTasks();
  } catch (error) {
    console.error("Failed to restore project:", error);
    alert("The project could not be restored.");
  }
}
async function handleProjectAction(event) {
  const button = event.target.closest("button[data-project-action]");
  if (!button) return;

  const action = button.dataset.projectAction;
  const projectId = button.dataset.projectId;

  switch (action) {
    case "edit":
      editProject(projectId);
      break;
    case "archive":
      await archiveProject(projectId);
      break;
    case "restore":
      await restoreProject(projectId);
      break;
    case "delete":
      await deleteProject(projectId);
      break;
  }
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

    if (editingProjectId) {
      await updateProjectInFirestore(currentUser.uid, editingProjectId, { name, description, color, estimatedHours });
    } else {
      await createProject(currentUser.uid, { name, description, color, estimatedHours });
    }

    projects = await getProjects(currentUser.uid);
    renderProjects();
    renderProjectOptions();
    renderTasks();
    closeProjectForm();
  } catch (error) {
    console.error(editingProjectId ? "Failed to update project:" : "Failed to create project:", error);
    alert(editingProjectId ? "The project could not be updated." : "The project could not be created.");
  } finally {
    saveProjectButton.disabled = false;
  }
}
function renderProjects() {
  const activeProjects = projects.filter(project => !project.archived);
  const archivedProjects = projects.filter(project => project.archived);

  if (projects.length === 0) {
    projectsContainer.innerHTML = `
      <div class="empty-state">
        <h3>No projects yet</h3>
        <p>Create your first project to begin organizing tasks.</p>
      </div>
    `;
    return;
  }
  
  const createProjectCard = project => {
    const projectTasks = tasks.filter(task => task.projectId === project.id && !task.archived);
    const completedCount = projectTasks.filter(task => task.completed).length;
    const estimate = project.estimatedHours !== null && project.estimatedHours !== undefined ? `${Number(project.estimatedHours).toFixed(2)} h estimated` : "No estimate";

    return `
      <div class="project-card${project.archived ? " archived" : ""}">
        <div class="project-card-heading">
          <span class="project-color" style="background:${project.color}"></span>
          <h3>${escapeHTML(project.name)}</h3>
        </div>
        <p>${escapeHTML(project.description || "No description")}</p>
        <div class="project-stats">
          <span>${projectTasks.length} tasks</span>
          <span>${completedCount} completed</span>
          <span>${estimate}</span>
        </div>
        <div class="project-actions">
        ${project.archived
          ? `<button type="button" data-project-action="restore" data-project-id="${project.id}">Restore</button>
             <button type="button" data-project-action="delete" data-project-id="${project.id}">Delete</button>`
          : `<button type="button" data-project-action="edit" data-project-id="${project.id}">Edit</button>
             <button type="button" data-project-action="archive" data-project-id="${project.id}">Archive</button>
             <button type="button" data-project-action="delete" data-project-id="${project.id}">Delete</button>`}
        </div>
      </div>
    `;
  };

  const activeHTML = activeProjects.length
    ? `<div class="project-grid">${activeProjects.map(createProjectCard).join("")}</div>`
    : `<p class="empty-state">No active projects.</p>`;

  const archivedHTML = archivedProjects.length
    ? `
      <section class="archived-projects">
        <h3>Archived Projects</h3>
        <div class="project-grid">${archivedProjects.map(createProjectCard).join("")}</div>
      </section>
    `
    : "";

  projectsContainer.innerHTML = activeHTML + archivedHTML;
}

function openManualSessionForm() {
  renderManualSessionProjectOptions();

  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);

  manualSessionStartInput.value = formatDateTimeLocal(start);
  manualSessionEndInput.value = formatDateTimeLocal(end);
  manualSessionNoteInput.value = "";
  manualSessionForm.hidden = false;
}

function closeManualSessionForm() {
  manualSessionForm.hidden = true;
  manualSessionStartInput.value = "";
  manualSessionEndInput.value = "";
  manualSessionNoteInput.value = "";
}

async function saveManualSession() {
  if (!currentUser) return;

  const projectId = manualSessionProjectInput.value;
  const taskId = manualSessionTaskInput.value;
  const project = projects.find(project => project.id === projectId);
  const task = tasks.find(task => task.id === taskId);
  const start = new Date(manualSessionStartInput.value);
  const end = new Date(manualSessionEndInput.value);
  const note = manualSessionNoteInput.value.trim();

  if (!project || !task) {
    alert("Select a valid project and task.");
    return;
  }

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    alert("Enter valid start and end times.");
    return;
  }

  if (end <= start) {
    alert("The end time must be after the start time.");
    return;
  }

  try {
    saveManualSessionButton.disabled = true;

    await createSession(currentUser.uid, {
      projectId: project.id,
      taskId: task.id,
      projectName: project.name,
      taskName: task.name,
      start,
      end,
      note,
      source: "manual"
    });

    sessions = normalizeSessions(await getSessions(currentUser.uid));

    closeManualSessionForm();
    render();
  } catch (error) {
    console.error("Failed to create manual session:", error);
    alert(error.message || "The manual session could not be saved.");
  } finally {
    saveManualSessionButton.disabled = false;
  }
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
    sessions = normalizeSessions(await getSessions(currentUser.uid));
    renderProjects();
    renderProjectOptions();
    renderManualSessionProjectOptions();
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

  if (!window.confirm(`Delete "${task.name}" and all of its tracked time?`)) return;

  try {
    await deleteSessionsByTask(currentUser.uid, id);
    await deleteTaskFromFirestore(currentUser.uid, id);

    tasks = await getTasks(currentUser.uid);
    sessions = normalizeSessions(await getSessions(currentUser.uid));

    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to delete task:", error);
    alert("The task could not be deleted.");
  }
}

async function completeTask(id) {
  if (!currentUser) return;

  const task = tasks.find(task => task.id === id);
  if (!task) return;

  if (state.runningTaskId === id) {
    await stopTask();
    if (state.runningTaskId === id) return;
  }

  try {
    await completeTaskInFirestore(currentUser.uid, id);
    tasks = await getTasks(currentUser.uid);
    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to complete task:", error);
    alert("The task could not be completed.");
  }
}

async function restoreTask(id) {
  if (!currentUser) return;

  const task = tasks.find(task => task.id === id);
  if (!task) return;

  try {
    await reopenTask(currentUser.uid, id);
    tasks = await getTasks(currentUser.uid);
    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to restore task:", error);
    alert("The task could not be restored.");
  }
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

    sessions = normalizeSessions(await getSessions(currentUser.uid));

    render();
  } catch (error) {
    console.error("Failed to stop timer:", error);
    alert("The session could not be saved. The timer is still running.");
  }
}

function formatDuration(seconds) {
  seconds = Number(seconds);

  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}
function getTaskSessionSeconds(taskId) {
  return sessions
    .filter(session => session.taskId === taskId)
    .reduce((total, session) => total + Number(session.durationSeconds || 0), 0);
}

function getCurrentSeconds(task) {
  let seconds = getTaskSessionSeconds(task.id);

  if (state.runningTaskId === task.id && Number.isFinite(Number(state.startTime))) {
    seconds += Math.max(0, (Date.now() - Number(state.startTime)) / 1000);
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
function normalizeSessions(sessionDocuments) {
  return sessionDocuments.map(session => ({
    ...session,
    start: session.start?.toMillis ? session.start.toMillis() : Number(session.start),
    end: session.end?.toMillis ? session.end.toMillis() : Number(session.end),
    durationSeconds: Number(session.durationSeconds || 0)
  }));
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
  const todayHours = today.reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekHours = sessions.filter(session => session.start >= sevenDaysAgo).reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
  const goalHours = tasks.filter(task => !task.completed).reduce((sum, task) => sum + Number(task.targetHours || 0), 0);
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

    return `<div>${startTime} - ${endTime} - ${escapeHTML(session.taskName)} (${formatDuration(session.durationSeconds)})</div>`;
  }).join("");
}

function renderPie() {
  const totals = {};

  getTodaySessions().forEach(session => {
    totals[session.taskName] = (totals[session.taskName] || 0) + session.durationSeconds / 3600;
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
      .reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
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
  const targetHours = Number(task.targetHours);
  const hasTarget = Number.isFinite(targetHours) && targetHours > 0;
  const goalSeconds = hasTarget ? targetHours * 3600 : 0;
  const percentage = hasTarget ? seconds / goalSeconds * 100 : 0;
  const differenceHours = hasTarget ? (seconds - goalSeconds) / 3600 : null;
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

  const targetDisplay = hasTarget
    ? `<div>Target: ${targetHours.toFixed(2)} h</div>`
    : `<div>Target: None</div>`;

  const progressDisplay = hasTarget
    ? `<div>${differenceHours >= 0 ? `Overrun: +${differenceHours.toFixed(2)} h` : `Remaining: ${Math.abs(differenceHours).toFixed(2)} h`}</div>
       <div>${percentage.toFixed(1)}%</div>
       <div class="progress"><div class="bar" style="width:${Math.min(Math.max(percentage, 0), 100)}%"></div></div>`
    : `<div>0.0%</div>
       <div class="progress"><div class="bar" style="width:0%"></div></div>`;

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

  const activeTasks = tasks.filter(task => !task.completed && !task.archived);

  activeTasks.forEach(task => {
    activeTasksContainer.appendChild(createTaskElement(task));
  });

  const completedTasks = tasks.filter(task => task.completed && !task.archived);

  if (completedTasks.length === 0) return;

  const projectGroups = completedTasks.reduce((groups, task) => {
    const projectId = task.projectId || "unknown";

    if (!groups[projectId]) groups[projectId] = [];

    groups[projectId].push(task);
    return groups;
  }, {});

  const sortedProjectGroups = Object.entries(projectGroups).sort(([, tasksA], [, tasksB]) => {
    const newestA = Math.max(...tasksA.map(task => getCompletedTimestamp(task)));
    const newestB = Math.max(...tasksB.map(task => getCompletedTimestamp(task)));

    return newestB - newestA;
  });

  sortedProjectGroups.forEach(([projectId, projectTasks]) => {
    const project = projects.find(project => project.id === projectId);
    const group = document.createElement("div");

    group.className = "completed-project-group";

    group.innerHTML = `
      <h3 class="completed-project-heading">
        ${project ? `<span style="background:${project.color}"></span>${escapeHTML(project.name)}` : "Unknown project"}
      </h3>
    `;

    projectTasks
      .sort((a, b) => getCompletedTimestamp(b) - getCompletedTimestamp(a))
      .forEach(task => {
        group.appendChild(createTaskElement(task));
      });

    completedTasksContainer.appendChild(group);
  });
}

function exportCSV() {
  let csv = "Task,Start,End,Hours\n";

  sessions.forEach(session => {
    const safeTaskName = String(session.taskName).replaceAll('"', '""');
    csv += `"${safeTaskName}","${new Date(session.start).toISOString()}","${new Date(session.end).toISOString()}",${(session.durationSeconds / 3600).toFixed(2)}\n`;
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
      await restoreTask(taskId);
      break;
    case "delete":
      await deleteTask(taskId);
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
newProjectButton.addEventListener("click", () => openProjectForm());
cancelProjectButton.addEventListener("click", closeProjectForm);
saveProjectButton.addEventListener("click", saveProject);
projectsContainer.addEventListener("click", handleProjectAction);
projectNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveProject();
});
addManualSessionButton.addEventListener("click", openManualSessionForm);
cancelManualSessionButton.addEventListener("click", closeManualSessionForm);
saveManualSessionButton.addEventListener("click", saveManualSession);
manualSessionProjectInput.addEventListener("change", renderManualSessionTaskOptions);