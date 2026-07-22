// ============================================================================
// IMPORTS
// ============================================================================
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from "./firebase.js";
import { createProject, getProjects, deleteProjectAndData, updateProject as updateProjectInFirestore, archiveProject as archiveProjectInFirestore, restoreProject as restoreProjectInFirestore, moveTaskSessionsToProject, 
         createTask, getTasks, updateTask as updateTaskInFirestore, completeTask as completeTaskInFirestore, reopenTask, deleteTask as deleteTaskFromFirestore, deleteSessionsByTask, archiveTask as archiveTaskInFirestore, restoreArchivedTask as restoreArchivedTaskInFirestore, createTaskNote, getTaskNotes, updateTaskNote, deleteTaskNote,
         getSessions, createSession, updateSession as updateSessionInFirestore, deleteSession as deleteSessionFromFirestore, saveTimerState, listenToTimerState } from "./database.js";

// ============================================================================
// APPLICATION STATE
// ============================================================================
let projects = [];
let tasks = [];
let sessions = [];
let taskNotes = [];
let state = {
  runningTaskId: null,
  runningProjectId: null,
  startTime: null
};

let currentUser = null;
let unsubscribeTimerState = null;
let editingProjectId = null;
let editingTaskId = null;
let editingTaskNoteId = null;
let editingSessionId = null;

let calendarDate = new Date();
calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);

let pieChart = null;
let weeklyChart = null;
let reportProjectChart = null;
let reportEstimateChart = null;
const collapsedActiveProjects = new Set();

// ============================================================================
// DOM REFERENCES
// ============================================================================
const nameInput = document.getElementById("name");
const goalInput = document.getElementById("goal");
const taskProjectInput = document.getElementById("taskProjectInput");
const taskParentInput = document.getElementById("taskParentInput");
const addTaskButton = document.getElementById("addTaskButton");
const activeTasksContainer = document.getElementById("tasks");
const completedTasksContainer = document.getElementById("completedTasks");
const completedTasksHeading = document.getElementById("completedTasksHeading");

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

const dashboardContainer = document.getElementById("dashboard");
const todayHistoryContainer = document.getElementById("history");
const fullHistoryContainer = document.getElementById("fullHistoryContainer");
const exportCSVButton = document.getElementById("exportCSVButton");

const historyProjectFilter = document.getElementById("historyProjectFilter");
const historyTaskFilter = document.getElementById("historyTaskFilter");
const historyStartDate = document.getElementById("historyStartDate");
const historyEndDate = document.getElementById("historyEndDate");
const calendarContainer = document.getElementById("calendarContainer");

const reportStartDate = document.getElementById("reportStartDate");
const reportEndDate = document.getElementById("reportEndDate");
const reportTodayButton = document.getElementById("reportTodayButton");
const reportCurrentWeekButton = document.getElementById("reportCurrentWeekButton");
const reportCurrentMonthButton = document.getElementById("reportCurrentMonthButton");
const reportAllTimeButton = document.getElementById("reportAllTimeButton");
const reportTotalHours = document.getElementById("reportTotalHours");
const reportTopProject = document.getElementById("reportTopProject");
const reportDailyAverage = document.getElementById("reportDailyAverage");
const reportCompletedTasks = document.getElementById("reportCompletedTasks");
const reportProjectChartCanvas = document.getElementById("reportProjectChart");
const reportEstimateChartCanvas = document.getElementById("reportEstimateChart");

const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const userStatus = document.getElementById("userStatus");
const appContent = document.getElementById("appContent");

const navButtons = document.querySelectorAll(".nav-button");
const appViews = document.querySelectorAll(".app-view");

// ============================================================================
// GENERAL UTILITIES
// ============================================================================
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDayStart(dateString) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function getLocalDayEnd(dateString) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function getTimestampMillis(value) {
  if (value?.toMillis) return value.toMillis();

  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function formatDuration(seconds) {
  seconds = Number(seconds);

  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

function formatHours(hours) {
  hours = Number(hours);
  if (!Number.isFinite(hours) || hours < 0) hours = 0;
  return formatDuration(hours * 3600);
}

function formatCalendarDuration(seconds) {
  seconds = Number(seconds);

  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function normalizeSessions(sessionDocuments) {
  return sessionDocuments.map(session => ({
    ...session,
    start: session.start?.toMillis ? session.start.toMillis() : Number(session.start),
    end: session.end?.toMillis ? session.end.toMillis() : Number(session.end),
    durationSeconds: Number(session.durationSeconds || 0)
  }));
}

// ============================================================================
// AUTHENTICATION AND DATA LOADING
// ============================================================================
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
    taskNotes = normalizeTaskNotes(await getTaskNotes(currentUser.uid));
    renderProjects();
    renderProjectOptions();
    renderManualSessionProjectOptions();
    renderHistoryFilterOptions();

    if (!reportStartDate.value && !reportEndDate.value) setReportCurrentMonth();
    console.log("Loaded projects:", projects);
    console.log("Loaded tasks:", tasks);
  } catch (error) {
    console.error("Failed to load Firestore data:", error);
    throw error;
  }
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

// ============================================================================
// PROJECT MANAGEMENT
// ============================================================================
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
  renderTaskParentOptions();
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
    const projectTasks = tasks.filter(task => task.projectId === project.id);
    const visibleTasks = projectTasks.filter(task => !task.archived);
    const archivedTasks = projectTasks.filter(task => task.archived);
    const completedCount = visibleTasks.filter(task => task.completed).length;
    const estimatedHours = getProjectEstimatedHours(project.id);
    const estimate = estimatedHours > 0 ? `${estimatedHours.toFixed(2)} h estimated from tasks` : "No task estimates";

    return `
      <div class="project-card${project.archived ? " archived" : ""}">
        <div class="project-card-heading">
          <span class="project-color" style="background:${project.color}"></span>
          <h3>${escapeHTML(project.name)}</h3>
        </div>

        <p>${escapeHTML(project.description || "No description")}</p>

        <div class="project-stats">
          <span>${visibleTasks.length} active tasks</span>
          <span>${completedCount} completed</span>
          <span>${archivedTasks.length} archived</span>
          <span>${estimate}</span>
        </div>

        ${archivedTasks.length ? `
          <details class="archived-task-list">
            <summary>Archived Tasks (${archivedTasks.length})</summary>
            ${archivedTasks.map(task => `
              <div class="archived-task-row">
                <span>${escapeHTML(task.name)}</span>
                <button type="button" data-action="unarchive" data-task-id="${task.id}">Restore</button>
              </div>
            `).join("")}
          </details>
        ` : ""}

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

// ============================================================================
// TASK AND SUBTASK MANAGEMENT
// ============================================================================
function isTaskVisible(task) {
  const project = projects.find(project => project.id === task.projectId);
  return !task.archived && project && !project.archived;
}

function getCompletedTimestamp(task) {
  if (task.completedAt?.toMillis) return task.completedAt.toMillis();

  const timestamp = Number(task.completedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function renderTaskParentOptions(selectedParentId = "") {
  const projectId = taskProjectInput.value;

  const possibleParents = tasks.filter(task => {
    if (task.projectId !== projectId) return false;
    if (task.parentTaskId) return false;
    if (task.archived) return false;
    if (task.id === editingTaskId) return false;
    return true;
  });

  taskParentInput.innerHTML = `
    <option value="">None — top-level task</option>
    ${possibleParents.map(task => `<option value="${task.id}">${escapeHTML(task.name)}</option>`).join("")}
  `;

  if (possibleParents.some(task => task.id === selectedParentId)) {
    taskParentInput.value = selectedParentId;
  }
}

function getSubtasks(parentTaskId) {
  return tasks.filter(task => task.parentTaskId === parentTaskId && !task.archived);
}

function taskHasSubtasks(taskId) {
  return getSubtasks(taskId).length > 0;
}

function getTaskTargetHours(task) {
  const subtasks = getSubtasks(task.id);
  if (subtasks.length === 0) return Number(task.targetHours || 0);
  return subtasks.reduce((total, subtask) => total + Number(subtask.targetHours || 0), 0);
}

function getTaskDisplaySeconds(task) {
  const ownSeconds = getCurrentSeconds(task);
  const subtasks = getSubtasks(task.id);
  if (subtasks.length === 0) return ownSeconds;
  return ownSeconds + subtasks.reduce((total, subtask) => total + getCurrentSeconds(subtask), 0);
}

function getProjectEstimatedHours(projectId) {
  return tasks
    .filter(task => task.projectId === projectId && !task.archived)
    .filter(task => task.parentTaskId || !taskHasSubtasks(task.id))
    .reduce((total, task) => total + Number(task.targetHours || 0), 0);
}

function getRemainingPlannedHours() {
  return tasks
    .filter(task => !task.completed && !task.archived)
    .filter(task => task.parentTaskId || !taskHasSubtasks(task.id))
    .reduce((total, task) => {
      const remainingSeconds = Math.max(0, Number(task.targetHours || 0) * 3600 - getCurrentSeconds(task));
      return total + remainingSeconds / 3600;
    }, 0);
}

function openTaskEditor(taskId) {
  const task = tasks.find(task => task.id === taskId);
  if (!task) return;

  editingTaskId = task.id;
  taskProjectInput.value = task.projectId;
  renderTaskParentOptions(task.parentTaskId || "");
  nameInput.value = task.name;

  const hasSubtasks = taskHasSubtasks(task.id);
  goalInput.value = hasSubtasks ? getTaskTargetHours(task) : task.targetHours ?? "";
  goalInput.disabled = hasSubtasks;
  goalInput.title = hasSubtasks ? "This target is calculated from the task's subtasks." : "";

  addTaskButton.textContent = "Save Changes";
  nameInput.focus();
  nameInput.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetTaskForm() {
  editingTaskId = null;
  nameInput.value = "";
  goalInput.value = "";
  goalInput.disabled = false;
  goalInput.title = "";
  addTaskButton.textContent = "Add Task";

  const generalProject = projects.find(project => !project.archived && project.name.trim().toLowerCase() === "general");
  if (generalProject) taskProjectInput.value = generalProject.id;

  renderTaskParentOptions();
}

async function addTask() {
  if (!currentUser) return;

  const name = nameInput.value.trim();
  const generalProject = projects.find(project => !project.archived && project.name.trim().toLowerCase() === "general");
  const projectId = taskProjectInput.value || generalProject?.id;
  const targetHours = goalInput.value === "" ? null : Number(goalInput.value);
  const parentTaskId = taskParentInput.value || null;

  if (!name) {
    alert("Enter a task name.");
    return;
  }

  if (!projectId) {
    alert('Create a project named "General" first.');
    return;
  }

  if (targetHours !== null && (!Number.isFinite(targetHours) || targetHours < 0)) {
    alert("Enter a valid target time.");
    return;
  }
  const parentTask = parentTaskId ? tasks.find(task => task.id === parentTaskId) : null;

  if (parentTaskId && (!parentTask || parentTask.projectId !== projectId)) {
    alert("Select a valid parent task.");
    return;
  }
  try {
    addTaskButton.disabled = true;

    if (editingTaskId) {
      const existingTask = tasks.find(task => task.id === editingTaskId);
    
      if (!existingTask) {
        alert("The task could not be found.");
        return;
      }
    
      if (state.runningTaskId === editingTaskId && existingTask.projectId !== projectId) {
        alert("Stop the running timer before moving this task to another project.");
        return;
      }
    
      const existingSubtasks = tasks.filter(task => task.parentTaskId === editingTaskId);
    
      if (parentTaskId && existingSubtasks.length > 0) {
        alert("A task with subtasks cannot itself be converted into a subtask.");
        return;
      }
    
      const projectChanged = existingTask.projectId !== projectId;
      const newProject = projects.find(project => project.id === projectId);
    
      await updateTaskInFirestore(currentUser.uid, editingTaskId, {
        name,
        projectId,
        parentTaskId,
        targetHours
      });
    
      if (projectChanged && newProject) {
        await moveTaskSessionsToProject(currentUser.uid, editingTaskId, newProject);
      
        for (const subtask of existingSubtasks) {
          await updateTaskInFirestore(currentUser.uid, subtask.id, {
            projectId: newProject.id
          });
      
          await moveTaskSessionsToProject(currentUser.uid, subtask.id, newProject);
        }
      }
    } else {
      await createTask(currentUser.uid, projectId, {
        name,
        description: "",
        targetHours,
        parentTaskId
      });
    }

    tasks = await getTasks(currentUser.uid);
    sessions = normalizeSessions(await getSessions(currentUser.uid))
    resetTaskForm();
    renderTaskParentOptions();
    renderProjects();
    renderManualSessionProjectOptions();
    render();
  } catch (error) {
    console.error(editingTaskId ? "Failed to update task:" : "Failed to create task:", error);
    alert(editingTaskId ? "The task could not be updated." : "The task could not be created.");
  } finally {
    addTaskButton.disabled = false;
  }
}

async function completeTask(id) {
  if (!currentUser) return;

  const task = tasks.find(task => task.id === id);
  if (!task) return;

  const incompleteSubtasks = getSubtasks(id).filter(subtask => !subtask.completed);
  if (incompleteSubtasks.length > 0) {
    alert(`Complete the ${incompleteSubtasks.length} unfinished subtask${incompleteSubtasks.length === 1 ? "" : "s"} before completing this parent task.`);
    return;
  }

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

async function archiveTask(taskId) {
  if (!currentUser) return;

  const task = tasks.find(task => task.id === taskId);
  if (!task) return;

  if (state.runningTaskId === taskId) {
    alert("Stop the running timer before archiving this task.");
    return;
  }

  if (!window.confirm(`Archive "${task.name}"? Its tracked time and session history will be preserved.`)) return;

  try {
    await archiveTaskInFirestore(currentUser.uid, taskId);
    tasks = await getTasks(currentUser.uid);
    renderProjects();
    renderManualSessionProjectOptions();
    render();
  } catch (error) {
    console.error("Failed to archive task:", error);
    alert("The task could not be archived.");
  }
}

async function unarchiveTask(taskId) {
  if (!currentUser) return;

  try {
    await restoreArchivedTaskInFirestore(currentUser.uid, taskId);
    tasks = await getTasks(currentUser.uid);
    renderProjects();
    renderManualSessionProjectOptions();
    render();
  } catch (error) {
    console.error("Failed to restore archived task:", error);
    alert("The task could not be restored.");
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

  const subtasks = tasks.filter(task => task.parentTaskId === id);

  if (subtasks.length > 0) {
    alert(`This task has ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}. Delete or move them before deleting the parent task.`);
    return;
  }

  if (!window.confirm(`Delete "${task.name}" and all of its tracked time?`)) return;

  try {
    await deleteSessionsByTask(currentUser.uid, id);
    await deleteTaskFromFirestore(currentUser.uid, id);

    tasks = await getTasks(currentUser.uid);
    sessions = normalizeSessions(await getSessions(currentUser.uid));

    renderTaskParentOptions();
    renderProjects();
    render();
  } catch (error) {
    console.error("Failed to delete task:", error);
    alert("The task could not be deleted.");
  }
}

function createTaskElement(task, isSubtask = false) {
  const project = projects.find(project => project.id === task.projectId);
  const parentTask = task.parentTaskId ? tasks.find(parent => parent.id === task.parentTaskId) : null;
  const relationshipLabel = isSubtask && parentTask
    ? `<div class="task-parent">Parent: ${escapeHTML(parentTask.name)}</div>`
    : project
      ? `<div class="task-project"><span style="background:${project.color}"></span>${escapeHTML(project.name)}</div>`
      : "";

  const subtasks = getSubtasks(task.id);
  const hasSubtasks = subtasks.length > 0;
  const seconds = getTaskDisplaySeconds(task);
  const targetHours = getTaskTargetHours(task);
  const hasTarget = Number.isFinite(targetHours) && targetHours > 0;
  const goalSeconds = hasTarget ? targetHours * 3600 : 0;
  const percentage = hasTarget ? seconds / goalSeconds * 100 : 0;
  const differenceHours = hasTarget ? (seconds - goalSeconds) / 3600 : null;
  const taskElement = document.createElement("div");
  const notes = getNotesForTask(task.id);
  const latestNote = notes[0];

  taskElement.className = [
    "card",
    "task",
    isSubtask ? "subtask" : "",
    hasSubtasks ? "task-parent-summary" : "",
    state.runningTaskId === task.id ? "running" : "",
    task.completed ? "completed" : ""
  ].filter(Boolean).join(" ");

  const timerButton = task.completed || hasSubtasks
    ? ""
    : state.runningTaskId === task.id
      ? `<button type="button" data-action="stop">Stop</button>`
      : `<button type="button" data-action="start" data-task-id="${task.id}">Start</button>`;

  const completionButton = task.completed
    ? `<button type="button" data-action="restore" data-task-id="${task.id}">Restore</button>`
    : `<button type="button" data-action="complete" data-task-id="${task.id}">Complete</button>`;

  const targetDisplay = hasTarget
    ? `<div>Target: ${targetHours.toFixed(2)} h${hasSubtasks ? ` from ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}` : ""}</div>`
    : `<div>Target: None</div>`;

  const trackedDisplay = hasSubtasks
    ? `<div>Tracked: ${formatDuration(seconds)} including subtasks</div>`
    : `<div>Tracked: ${formatDuration(seconds)}</div>`;

  const progressDisplay = hasTarget
    ? `<div>${differenceHours >= 0 ? `Overrun: +${differenceHours.toFixed(2)} h` : `Remaining: ${Math.abs(differenceHours).toFixed(2)} h`}</div>
       <div>${percentage.toFixed(1)}%</div>
       <div class="progress"><div class="bar" style="width:${Math.min(Math.max(percentage, 0), 100)}%"></div></div>`
    : "";

  const archiveButton = task.archived
    ? `<button type="button" data-action="unarchive" data-task-id="${task.id}">Restore from Archive</button>`
    : `<button type="button" data-action="archive" data-task-id="${task.id}">Archive</button>`;
  
    const notesDisplay = `
    <details class="task-notes">
      <summary>
        Notes (${notes.length})
        ${latestNote ? `<span class="task-note-preview">Latest: ${escapeHTML(latestNote.text)}</span>` : ""}
      </summary>
  
      <div class="task-note-list">
        ${notes.length
          ? notes.map(note => `
              <div class="task-note-entry">
                <div class="task-note-text">${escapeHTML(note.text)}</div>
                <div class="task-note-meta">${formatTaskNoteDate(note.createdAt)}</div>
  
                <div class="task-note-actions">
                  <button type="button" data-note-action="edit" data-note-id="${note.id}" data-task-id="${task.id}">Edit</button>
                  <button type="button" data-note-action="delete" data-note-id="${note.id}" data-task-id="${task.id}">Delete</button>
                </div>
              </div>
            `).join("")
          : `<p class="empty-state">No notes yet.</p>`}
      </div>
  
      <div class="task-note-form">
        <textarea data-note-input="${task.id}" rows="3" placeholder="Write an update about this task..."></textarea>
        <button type="button" data-note-action="save" data-task-id="${task.id}">Add Note</button>
        <button type="button" data-note-action="cancel" data-task-id="${task.id}" hidden>Cancel</button>
      </div>
    </details>
  `;
  taskElement.innerHTML = `
    ${relationshipLabel}
    <h3>${escapeHTML(task.name)}</h3>
    ${targetDisplay}
    ${trackedDisplay}
    ${progressDisplay}
    ${hasSubtasks ? `<div class="small">Use the subtask timers below.</div>` : ""}
    ${task.completedAt ? `<div class="small">Completed: ${task.completedAt.toDate ? task.completedAt.toDate().toLocaleDateString() : new Date(task.completedAt).toLocaleDateString()}</div>` : ""}
    <br>
    ${timerButton}
    ${completionButton}
    <button type="button" data-action="edit" data-task-id="${task.id}">Edit</button>
    ${archiveButton}
    <button type="button" data-action="delete" data-task-id="${task.id}">Delete</button>
    ${notesDisplay}
  `;

  return taskElement;
}

function appendTaskTree(container, parentTask, visibleTasks) {
  const parentWrapper = document.createElement("div");
  parentWrapper.className = "task-tree";

  parentWrapper.appendChild(createTaskElement(parentTask));

  const subtasks = visibleTasks
    .filter(task => task.parentTaskId === parentTask.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (subtasks.length > 0) {
    const subtaskContainer = document.createElement("div");
    subtaskContainer.className = "subtask-list";

    subtasks.forEach(subtask => {
      subtaskContainer.appendChild(createTaskElement(subtask, true));
    });

    parentWrapper.appendChild(subtaskContainer);
  }

  container.appendChild(parentWrapper);
}

function renderTasks() {
  activeTasksContainer.innerHTML = "";
  completedTasksContainer.innerHTML = "";

  const visibleTasks = tasks.filter(task => isTaskVisible(task));
  const activeTasks = visibleTasks.filter(task => !task.completed);

  const activeTasksByProject = activeTasks.reduce((groups, task) => {
    const projectId = task.projectId || "unknown";

    if (!groups[projectId]) groups[projectId] = [];
    groups[projectId].push(task);

    return groups;
  }, {});

  const sortedActiveProjectGroups = Object.entries(activeTasksByProject).sort(([projectIdA], [projectIdB]) => {
    const projectA = projects.find(project => project.id === projectIdA);
    const projectB = projects.find(project => project.id === projectIdB);

    return (projectA?.name || "").localeCompare(projectB?.name || "");
  });

  sortedActiveProjectGroups.forEach(([projectId, projectTasks]) => {
    const project = projects.find(project => project.id === projectId);
    const activeParents = projectTasks.filter(task => !task.parentTaskId);
    const totalSeconds = projectTasks.reduce((total, task) => total + getTaskSessionSeconds(task.id), 0);
    const estimatedHours = getProjectEstimatedHours(projectId);

    const projectGroup = document.createElement("details");
    projectGroup.className = "active-project-group";
    projectGroup.open = !collapsedActiveProjects.has(projectId);

    const summary = document.createElement("summary");
    summary.className = "active-project-summary";
    summary.innerHTML = `
      <div class="active-project-heading">
        <span class="project-color" style="background:${project?.color || "#777777"}"></span>

        <div>
          <strong>${escapeHTML(project?.name || "Unknown project")}</strong>
          <div class="active-project-meta">
            ${activeParents.length} top-level task${activeParents.length === 1 ? "" : "s"} ·
            ${formatDuration(totalSeconds)} tracked ·
            ${estimatedHours.toFixed(2)} h estimated
          </div>
        </div>
      </div>
    `;

    const projectTaskContainer = document.createElement("div");
    projectTaskContainer.className = "active-project-task-list";

    activeParents
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(parentTask => {
        appendTaskTree(projectTaskContainer, parentTask, projectTasks);
      });
    projectGroup.addEventListener("toggle", () => {
        if (projectGroup.open) {
          collapsedActiveProjects.delete(projectId);
        } else {
          collapsedActiveProjects.add(projectId);
        }
      });

    projectGroup.appendChild(summary);
    projectGroup.appendChild(projectTaskContainer);
    activeTasksContainer.appendChild(projectGroup);
  });

  const completedTasks = visibleTasks.filter(task => task.completed);
  if (completedTasks.length === 0) return;

  const completedByProject = completedTasks.reduce((groups, task) => {
    const projectId = task.projectId || "unknown";
    if (!groups[projectId]) groups[projectId] = [];
    groups[projectId].push(task);
    return groups;
  }, {});

  const sortedProjectGroups = Object.entries(completedByProject).sort(([, tasksA], [, tasksB]) => {
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
  
    const completedParents = projectTasks
      .filter(task => !task.parentTaskId)
      .sort((a, b) => getCompletedTimestamp(b) - getCompletedTimestamp(a));
  
    completedParents.forEach(parentTask => {
      appendTaskTree(group, parentTask, projectTasks);
    });
  
    const completedOrphanedSubtasks = projectTasks
      .filter(task => {
        if (!task.parentTaskId) return false;
  
        const parent = tasks.find(parentTask => parentTask.id === task.parentTaskId);
  
        return !parent || !parent.completed;
      })
      .sort((a, b) => getCompletedTimestamp(b) - getCompletedTimestamp(a));
  
    completedOrphanedSubtasks.forEach(subtask => {
      group.appendChild(createTaskElement(subtask, true));
    });
  
    completedTasksContainer.appendChild(group);
  });
}

function toggleCompleted() {
  const isHidden = completedTasksContainer.style.display === "none" || completedTasksContainer.style.display === "";

  completedTasksContainer.style.display = isHidden ? "block" : "none";
  completedTasksHeading.textContent = isHidden ? "Completed Tasks ▲" : "Completed Tasks ▼";
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
    case "edit":
      openTaskEditor(taskId);
      break;
    case "archive":
      await archiveTask(taskId);
      break;
    case "unarchive":
      await unarchiveTask(taskId);
      break;
    
  }
}
function taskElementButton(taskId, action) {
  const textarea = document.querySelector(`textarea[data-note-input="${taskId}"]`);
  const taskElement = textarea?.closest(".task");

  return taskElement?.querySelector(`button[data-note-action="${action}"][data-task-id="${taskId}"]`) || null;
}
async function handleTaskNoteAction(event) {
  const button = event.target.closest("button[data-note-action]");
  if (!button || !currentUser) return;

  const action = button.dataset.noteAction;
  const taskId = button.dataset.taskId;
  const noteId = button.dataset.noteId;
  const task = tasks.find(task => task.id === taskId);
  const textarea = document.querySelector(`textarea[data-note-input="${taskId}"]`);

  if (!task || !textarea) return;

  if (action === "save") {
    const text = textarea.value.trim();

    if (!text) {
      alert("Enter a note.");
      return;
    }

    try {
      button.disabled = true;

      const editingNote = editingTaskNoteId
        ? taskNotes.find(note => note.id === editingTaskNoteId)
        : null;

      if (editingNote && editingNote.taskId === taskId) {
        await updateTaskNote(currentUser.uid, editingTaskNoteId, { text });
      } else {
        await createTaskNote(currentUser.uid, {
          taskId: task.id,
          text
        });
      }

      taskNotes = normalizeTaskNotes(await getTaskNotes(currentUser.uid));
      editingTaskNoteId = null;
      renderTasks();
    } catch (error) {
      console.error("Failed to save task note:", error);
      alert("The task note could not be saved.");
    } finally {
      button.disabled = false;
    }

    return;
  }

  if (action === "edit") {
    const note = taskNotes.find(note => note.id === noteId);
    if (!note) return;

    editingTaskNoteId = note.id;
    textarea.value = note.text;

    const saveButton = taskElementButton(taskId, "save");
    const cancelButton = taskElementButton(taskId, "cancel");

    if (saveButton) saveButton.textContent = "Save Changes";
    if (cancelButton) cancelButton.hidden = false;

    textarea.focus();
    return;
  }

  if (action === "cancel") {
    editingTaskNoteId = null;
    textarea.value = "";

    const saveButton = taskElementButton(taskId, "save");
    const cancelButton = taskElementButton(taskId, "cancel");

    if (saveButton) saveButton.textContent = "Add Note";
    if (cancelButton) cancelButton.hidden = true;

    return;
  }

  if (action === "delete") {
    const note = taskNotes.find(note => note.id === noteId);
    if (!note) return;

    if (!window.confirm("Delete this task note?")) return;

    try {
      await deleteTaskNote(currentUser.uid, noteId);
      taskNotes = normalizeTaskNotes(await getTaskNotes(currentUser.uid));

      if (editingTaskNoteId === noteId) editingTaskNoteId = null;

      renderTasks();
    } catch (error) {
      console.error("Failed to delete task note:", error);
      alert("The task note could not be deleted.");
    }
  }
}
// ============================================================================
// TIMER MANAGEMENT
// ============================================================================
function normalizeTaskNotes(noteDocuments) {
  return noteDocuments.map(note => ({
    ...note,
    createdAt: note.createdAt?.toMillis ? note.createdAt.toMillis() : Number(note.createdAt),
    updatedAt: note.updatedAt?.toMillis ? note.updatedAt.toMillis() : Number(note.updatedAt)
  }));
}
function getNotesForTask(taskId) {
  return taskNotes
    .filter(note => note.taskId === taskId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
function formatTaskNoteDate(timestamp) {
  const date = new Date(timestamp);

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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

async function startTask(id) {
  const task = tasks.find(task => task.id === id);
  if (!task || task.completed || !currentUser) return;

  if (taskHasSubtasks(task.id)) {
    alert("Start one of this task's subtasks instead of timing the parent task.");
    return;
  }

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

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================
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

function openManualSessionForm() {
  editingSessionId = null;
  renderManualSessionProjectOptions();

  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);

  manualSessionStartInput.value = formatDateTimeLocal(start);
  manualSessionEndInput.value = formatDateTimeLocal(end);
  manualSessionNoteInput.value = "";
  saveManualSessionButton.textContent = "Save Session";
  manualSessionForm.hidden = false;
}

function closeManualSessionForm() {
  editingSessionId = null;
  manualSessionForm.hidden = true;
  manualSessionStartInput.value = "";
  manualSessionEndInput.value = "";
  manualSessionNoteInput.value = "";
  saveManualSessionButton.textContent = "Save Session";
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

    const sessionData = {
      projectId: project.id,
      taskId: task.id,
      projectName: project.name,
      taskName: task.name,
      start,
      end,
      note,
      source: editingSessionId ? sessions.find(session => session.id === editingSessionId)?.source || "manual" : "manual"
    };

    if (editingSessionId) {
      await updateSessionInFirestore(currentUser.uid, editingSessionId, sessionData);
    } else {
      await createSession(currentUser.uid, sessionData);
    }

    sessions = normalizeSessions(await getSessions(currentUser.uid));

    closeManualSessionForm();
    render();
  } catch (error) {
    console.error(editingSessionId ? "Failed to update session:" : "Failed to create session:", error);
    alert(editingSessionId ? "The session could not be updated." : "The session could not be created.");
  } finally {
    saveManualSessionButton.disabled = false;
  }
}

function editSession(sessionId) {
  const session = sessions.find(session => session.id === sessionId);
  if (!session) return;

  editingSessionId = session.id;

  showAppView("historyView");

  renderManualSessionProjectOptions();
  manualSessionProjectInput.value = session.projectId;
  renderManualSessionTaskOptions();
  manualSessionTaskInput.value = session.taskId;

  manualSessionStartInput.value = formatDateTimeLocal(new Date(session.start));
  manualSessionEndInput.value = formatDateTimeLocal(new Date(session.end));
  manualSessionNoteInput.value = session.note || "";

  saveManualSessionButton.textContent = "Save Changes";
  manualSessionForm.hidden = false;

  requestAnimationFrame(() => {
    manualSessionForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function deleteSession(sessionId) {
  if (!currentUser) return;

  const session = sessions.find(session => session.id === sessionId);
  if (!session) return;

  const confirmed = window.confirm(
    `Delete this session for "${session.taskName}"?\n\n` +
    `${new Date(session.start).toLocaleString()} — ${formatDuration(session.durationSeconds)}\n\n` +
    `This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await deleteSessionFromFirestore(currentUser.uid, sessionId);
    sessions = normalizeSessions(await getSessions(currentUser.uid));
    render();
  } catch (error) {
    console.error("Failed to delete session:", error);
    alert("The session could not be deleted.");
  }
}

async function handleSessionAction(event) {
  const button = event.target.closest("button[data-session-action]");
  if (!button) return;

  const action = button.dataset.sessionAction;
  const sessionId = button.dataset.sessionId;

  switch (action) {
    case "edit":
      editSession(sessionId);
      break;
    case "delete":
      await deleteSession(sessionId);
      break;
  }
}

// ============================================================================
// HISTORY AND FILTERS
// ============================================================================
function getStartOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getTodaySessions() {
  const startOfToday = getStartOfToday();
  return sessions.filter(session => session.start >= startOfToday);
}

function getProjectTaskFilteredSessions() {
  const projectId = historyProjectFilter.value;
  const taskId = historyTaskFilter.value;

  return sessions.filter(session => {
    if (projectId && session.projectId !== projectId) return false;
    if (taskId && session.taskId !== taskId) return false;
    return true;
  });
}

function getFilteredSessions() {
  const startTime = getLocalDayStart(historyStartDate.value);
  const endTime = getLocalDayEnd(historyEndDate.value);

  return getProjectTaskFilteredSessions().filter(session => {
    if (startTime !== null && session.start < startTime) return false;
    if (endTime !== null && session.start > endTime) return false;
    return true;
  }).sort((a, b) => b.start - a.start);
}

function validateHistoryDateRange() {
  const startTime = getLocalDayStart(historyStartDate.value);
  const endTime = getLocalDayEnd(historyEndDate.value);

  if (startTime !== null && endTime !== null && startTime > endTime) {
    historyEndDate.value = historyStartDate.value;
  }

  renderFullHistory();
}

function renderHistoryFilterOptions() {
  const selectedProjectId = historyProjectFilter.value;
  const selectedTaskId = historyTaskFilter.value;

  historyProjectFilter.innerHTML = `
    <option value="">All projects</option>
    ${projects.map(project => `<option value="${project.id}">${escapeHTML(project.name)}</option>`).join("")}
  `;

  if (projects.some(project => project.id === selectedProjectId)) {
    historyProjectFilter.value = selectedProjectId;
  }

  renderHistoryTaskFilterOptions(selectedTaskId);
}

function renderHistoryTaskFilterOptions(selectedTaskId = "") {
  const projectId = historyProjectFilter.value;
  const matchingTasks = projectId
    ? tasks.filter(task => task.projectId === projectId)
    : tasks;

  historyTaskFilter.innerHTML = `
    <option value="">All tasks</option>
    ${matchingTasks.map(task => `<option value="${task.id}">${escapeHTML(task.name)}</option>`).join("")}
  `;

  if (matchingTasks.some(task => task.id === selectedTaskId)) {
    historyTaskFilter.value = selectedTaskId;
  }
}

function renderTodayHistory() {
  const todaySessions = [...getTodaySessions()].sort((a, b) => b.start - a.start);

  if (todaySessions.length === 0) {
    todayHistoryContainer.textContent = "No sessions today";
    return;
  }

  todayHistoryContainer.innerHTML = todaySessions.map(session => {
    const startTime = new Date(session.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const endTime = new Date(session.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    return `
      <div class="history-entry">
        <div class="session-details">
          <div class="session-project">${escapeHTML(session.projectName || "Unknown project")}</div>
          <div class="session-task">${escapeHTML(session.taskName || "Unknown task")}</div>
          <div class="session-time">${startTime} - ${endTime} · ${formatDuration(session.durationSeconds)}</div>
        </div>

        <div class="session-actions">
          <button type="button" data-session-action="edit" data-session-id="${session.id}">Edit</button>
          <button type="button" data-session-action="delete" data-session-id="${session.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderFullHistory() {
  const filteredSessions = getFilteredSessions();

  if (filteredSessions.length === 0) {
    fullHistoryContainer.innerHTML = `<p class="empty-state">No sessions match the selected filters.</p>`;
    return;
  }

  fullHistoryContainer.innerHTML = filteredSessions.map(session => {
    const start = new Date(session.start);
    const end = new Date(session.end);

    const dateLabel = start.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const startTime = start.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

    const endTime = end.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

    return `
      <div class="history-entry">
        <div class="session-details">
          <div class="session-project">${escapeHTML(session.projectName || "Unknown project")}</div>
          <div class="session-task">${escapeHTML(session.taskName || "Unknown task")}</div>
          <div class="session-time">${dateLabel} · ${startTime}–${endTime} · ${formatDuration(session.durationSeconds)}</div>
          ${session.note ? `<div class="session-note">${escapeHTML(session.note)}</div>` : ""}
        </div>

        <div class="session-actions">
          <button type="button" data-session-action="edit" data-session-id="${session.id}">Edit</button>
          <button type="button" data-session-action="delete" data-session-id="${session.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

// ============================================================================
// CALENDAR
// ============================================================================
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const dailyTotals = getProjectTaskFilteredSessions().reduce((totals, session) => {
    const dateKey = getLocalDateKey(new Date(session.start));
    totals[dateKey] = (totals[dateKey] || 0) + Number(session.durationSeconds || 0);
    return totals;
  }, {});

  const monthLabel = firstDay.toLocaleDateString([], {
    month: "long",
    year: "numeric"
  });

  const selectedStartDate = historyStartDate.value;
  const selectedEndDate = historyEndDate.value;

  let dayCells = "";

  for (let index = 0; index < firstWeekday; index++) {
    dayCells += `<div class="calendar-day calendar-day-empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateKey = getLocalDateKey(date);
    const seconds = dailyTotals[dateKey] || 0;
    const isToday = dateKey === getLocalDateKey(new Date());
    const isSelected = dateKey === selectedStartDate && dateKey === selectedEndDate;

    dayCells += `
      <button
        type="button"
        class="calendar-day${isToday ? " today" : ""}${isSelected ? " selected" : ""}${seconds > 0 ? " has-time" : ""}"
        data-calendar-date="${dateKey}"
      >
        <span class="calendar-day-number">${day}</span>
        ${seconds > 0 ? `<span class="calendar-day-total">${formatCalendarDuration(seconds)}</span>` : ""}
      </button>
    `;
  }

  calendarContainer.innerHTML = `
    <div class="calendar-header">
      <button type="button" class="secondary-button" data-calendar-action="previous" aria-label="Previous month">‹</button>
      <h3>${monthLabel}</h3>
      <button type="button" class="secondary-button" data-calendar-action="next" aria-label="Next month">›</button>
    </div>

    <div class="calendar-weekdays">
      <span>Sun</span>
      <span>Mon</span>
      <span>Tue</span>
      <span>Wed</span>
      <span>Thu</span>
      <span>Fri</span>
      <span>Sat</span>
    </div>

    <div class="calendar-grid">
      ${dayCells}
    </div>
  `;
}

function handleCalendarAction(event) {
  const navigationButton = event.target.closest("button[data-calendar-action]");

  if (navigationButton) {
    const action = navigationButton.dataset.calendarAction;

    if (action === "previous") {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    }

    if (action === "next") {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    }

    renderCalendar();
    return;
  }

  const dayButton = event.target.closest("button[data-calendar-date]");
  if (!dayButton) return;

  const selectedDate = dayButton.dataset.calendarDate;

  historyStartDate.value = selectedDate;
  historyEndDate.value = selectedDate;

  renderFullHistory();
  renderCalendar();
}

// ============================================================================
// DASHBOARD AND CHARTS
// ============================================================================
function renderDashboard() {
  const today = getTodaySessions();
  const todayHours = today.reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekHours = sessions.filter(session => session.start >= sevenDaysAgo).reduce((sum, session) => sum + session.durationSeconds, 0) / 3600;
  const remainingHours = getRemainingPlannedHours();
  const completedCount = tasks.filter(task => task.completed).length;
  const completionRate = tasks.length > 0 ? completedCount / tasks.length * 100 : 0;
  const runningTask = tasks.find(task => task.id === state.runningTaskId);

  dashboardContainer.innerHTML = `
    <div class="card"><b>Today</b><br>${formatHours(todayHours)}</div>
    <div class="card"><b>This Week</b><br>${formatHours(weekHours)}</div>
    <div class="card"><b>Remaining Planned</b><br>${formatHours(remainingHours)}</div>
    <div class="card"><b>Completed Tasks</b><br>${completedCount}/${tasks.length} (${completionRate.toFixed(1)}%)</div>
    <div class="card"><b>Running</b><br>${runningTask ? escapeHTML(runningTask.name) : "None"}</div>
  `;
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

// ============================================================================
// REPORTS
// ============================================================================
function setReportCurrentMonth() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  reportStartDate.value = getLocalDateKey(firstDay);
  reportEndDate.value = getLocalDateKey(lastDay);
}

function setReportToday() {
  const today = getLocalDateKey(new Date());
  reportStartDate.value = today;
  reportEndDate.value = today;
}

function setReportCurrentWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const firstDay = new Date(today);
  firstDay.setDate(today.getDate() - daysSinceMonday);

  reportStartDate.value = getLocalDateKey(firstDay);
  reportEndDate.value = getLocalDateKey(today);
}

function getReportSessions() {
  const startTime = getLocalDayStart(reportStartDate.value);
  const endTime = getLocalDayEnd(reportEndDate.value);

  return sessions.filter(session => {
    if (startTime !== null && session.start < startTime) return false;
    if (endTime !== null && session.start > endTime) return false;
    return true;
  });
}

function getCompletedTasksForReport() {
  const startTime = getLocalDayStart(reportStartDate.value);
  const endTime = getLocalDayEnd(reportEndDate.value);

  return tasks.filter(task => {
    if (!task.completed || !task.completedAt) return false;

    const completedTime = getTimestampMillis(task.completedAt);
    if (completedTime === null) return false;
    if (startTime !== null && completedTime < startTime) return false;
    if (endTime !== null && completedTime > endTime) return false;

    return true;
  });
}

function getReportProjectTotals(reportSessions) {
  const totals = {};

  reportSessions.forEach(session => {
    const projectId = session.projectId || "unknown";

    if (!totals[projectId]) {
      const project = projects.find(project => project.id === projectId);

      totals[projectId] = {
        projectId,
        name: project?.name || session.projectName || "Unknown project",
        color: project?.color || "#777777",
        seconds: 0
      };
    }

    totals[projectId].seconds += Number(session.durationSeconds || 0);
  });

  return Object.values(totals).sort((a, b) => b.seconds - a.seconds);
}

function getReportDayCount(reportSessions) {
  const startTime = getLocalDayStart(reportStartDate.value);
  const endTime = getLocalDayEnd(reportEndDate.value);

  if (startTime !== null && endTime !== null) {
    return Math.max(1, Math.round((endTime - startTime) / 86400000));
  }

  if (reportSessions.length === 0) return 1;

  const earliest = Math.min(...reportSessions.map(session => session.start));
  const latest = Math.max(...reportSessions.map(session => session.start));

  return Math.max(1, Math.floor((latest - earliest) / 86400000) + 1);
}

function renderReportSummary(reportSessions, projectTotals) {
  const totalSeconds = reportSessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0);
  const dayCount = getReportDayCount(reportSessions);
  const topProject = projectTotals[0];
  const completedCount = getCompletedTasksForReport().length;

  reportTotalHours.textContent = formatDuration(totalSeconds);
  reportTopProject.textContent = topProject?.name || "None";
  reportDailyAverage.textContent = formatDuration(totalSeconds / dayCount);
  reportCompletedTasks.textContent = completedCount;
}

function renderReportProjectChart(projectTotals) {
  if (reportProjectChart) reportProjectChart.destroy();

  reportProjectChart = new Chart(reportProjectChartCanvas, {
    type: "bar",
    data: {
      labels: projectTotals.map(project => project.name),
      datasets: [{
        label: "Tracked Hours",
        data: projectTotals.map(project => project.seconds / 3600),
        backgroundColor: projectTotals.map(project => project.color)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Hours"
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `Tracked: ${formatHours(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

function renderReportEstimateChart(projectTotals) {
  const estimatedProjects = projects
    .map(project => ({ ...project, derivedEstimatedHours: getProjectEstimatedHours(project.id) }))
    .filter(project => project.derivedEstimatedHours > 0);

  if (reportEstimateChart) reportEstimateChart.destroy();

  reportEstimateChart = new Chart(reportEstimateChartCanvas, {
    type: "bar",
    data: {
      labels: estimatedProjects.map(project => project.name),
      datasets: [
        {
          label: "Estimated Hours",
          data: estimatedProjects.map(project => project.derivedEstimatedHours)
        },
        {
          label: "Tracked Hours",
          data: estimatedProjects.map(project => {
            const total = projectTotals.find(total => total.projectId === project.id);
            return total ? total.seconds / 3600 : 0;
          })
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Hours"
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.dataset.label}: ${formatHours(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

function renderReports() {
  const reportSessions = getReportSessions();
  const projectTotals = getReportProjectTotals(reportSessions);

  renderReportSummary(reportSessions, projectTotals);
  renderReportProjectChart(projectTotals);
  renderReportEstimateChart(projectTotals);
}

// ============================================================================
// EXPORT
// ============================================================================
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

// ============================================================================
// MAIN RENDERING
// ============================================================================
function render() {
  renderDashboard();
  renderTasks();
  renderTodayHistory();
  renderFullHistory();
  renderCalendar();
  renderPie();
  renderWeekly();
  renderReports();
}

// ============================================================================
// AUTH STATE OBSERVER
// ============================================================================
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
    taskNotes = [];
    state = {
      runningTaskId: null,
      runningProjectId: null,
      startTime: null
    };
    editingTaskNoteId = null;
    currentUser = null;
    userStatus.textContent = "Not signed in";
    loginButton.hidden = false;
    logoutButton.hidden = true;
    appContent.hidden = true;
  }
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================
// Authentication
loginButton.addEventListener("click", loginWithGoogle);
logoutButton.addEventListener("click", logoutUser);

// Navigation

function showAppView(viewId) {
  navButtons.forEach(button => button.classList.toggle("active", button.dataset.view === viewId));
  appViews.forEach(view => {
    view.hidden = view.id !== viewId;
  });
}

navButtons.forEach(button => {
  button.addEventListener("click", () => showAppView(button.dataset.view));
});

// Projects
newProjectButton.addEventListener("click", () => openProjectForm());
cancelProjectButton.addEventListener("click", closeProjectForm);
saveProjectButton.addEventListener("click", saveProject);
projectsContainer.addEventListener("click", handleProjectAction);
projectsContainer.addEventListener("click", handleTaskAction);
projectNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") saveProject();
});


// Tasks
addTaskButton.addEventListener("click", addTask);
activeTasksContainer.addEventListener("click", handleTaskAction);
completedTasksContainer.addEventListener("click", handleTaskAction);
completedTasksHeading.addEventListener("click", toggleCompleted);
taskProjectInput.addEventListener("change", () => renderTaskParentOptions());
nameInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addTask();
});
goalInput.addEventListener("keydown", event => {
  if (event.key === "Enter") addTask();
});
activeTasksContainer.addEventListener("click", handleTaskNoteAction);
completedTasksContainer.addEventListener("click", handleTaskNoteAction);

// Sessions
addManualSessionButton.addEventListener("click", openManualSessionForm);
cancelManualSessionButton.addEventListener("click", closeManualSessionForm);
saveManualSessionButton.addEventListener("click", saveManualSession);
manualSessionProjectInput.addEventListener("change", renderManualSessionTaskOptions);
todayHistoryContainer.addEventListener("click", handleSessionAction);
fullHistoryContainer.addEventListener("click", handleSessionAction);

// History filters
historyProjectFilter.addEventListener("change", () => {
  renderHistoryTaskFilterOptions();
  renderFullHistory();
  renderCalendar();
});
historyTaskFilter.addEventListener("change", () => {
  renderFullHistory();
  renderCalendar();
});
historyStartDate.addEventListener("change", () => {
  validateHistoryDateRange();
  renderCalendar();
});
historyEndDate.addEventListener("change", () => {
  validateHistoryDateRange();
  renderCalendar();
});

// Calendar
calendarContainer.addEventListener("click", handleCalendarAction);

// Reports
reportStartDate.addEventListener("change", renderReports);
reportEndDate.addEventListener("change", renderReports);
reportTodayButton.addEventListener("click", () => {
  setReportToday();
  renderReports();
});

reportCurrentWeekButton.addEventListener("click", () => {
  setReportCurrentWeek();
  renderReports();
});
reportCurrentMonthButton.addEventListener("click", () => {
  setReportCurrentMonth();
  renderReports();
});
reportAllTimeButton.addEventListener("click", () => {
  reportStartDate.value = "";
  reportEndDate.value = "";
  renderReports();
});


// Export
exportCSVButton.addEventListener("click", exportCSV);

// Keep running timers visually current.
setInterval(() => {
  if (!currentUser) return;
  renderDashboard();
  renderTasks();
}, 1000);