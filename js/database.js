import { db } from "./firebase.js";
import { collection, addDoc, getDocs, doc, updateDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

export async function createProject(userId, projectData) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!projectData.name?.trim()) throw new Error("A project name is required.");

  const project = {
    name: projectData.name.trim(),
    description: projectData.description?.trim() || "",
    color: projectData.color || "#4f83cc",
    estimatedHours: projectData.estimatedHours ?? null,
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const projectsCollection = collection(db, "users", userId, "projects");
  const projectDocument = await addDoc(projectsCollection, project);

  return projectDocument.id;
}

export async function getProjects(userId) {
  if (!userId) throw new Error("A signed-in user is required.");

  const projectsCollection = collection(db, "users", userId, "projects");
  const projectsQuery = query(projectsCollection, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(projectsQuery);

  return snapshot.docs.map(projectDocument => ({
    id: projectDocument.id,
    ...projectDocument.data()
  }));
}

export async function updateProject(userId, projectId, changes) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!projectId) throw new Error("A project ID is required.");

  const allowedChanges = {};

  if (changes.name !== undefined) allowedChanges.name = changes.name.trim();
  if (changes.description !== undefined) allowedChanges.description = changes.description.trim();
  if (changes.color !== undefined) allowedChanges.color = changes.color;
  if (changes.estimatedHours !== undefined) allowedChanges.estimatedHours = changes.estimatedHours;
  if (changes.archived !== undefined) allowedChanges.archived = changes.archived;

  allowedChanges.updatedAt = serverTimestamp();

  const projectReference = doc(db, "users", userId, "projects", projectId);
  await updateDoc(projectReference, allowedChanges);
}

export async function archiveProject(userId, projectId) {
  await updateProject(userId, projectId, { archived: true });
}

export async function restoreProject(userId, projectId) {
  await updateProject(userId, projectId, { archived: false });
}


export async function createTask(userId, projectId,taskData) {
    if (!userId) throw new Error("A signed-in user is required.");
    if (!projectId) throw new Error("A project ID is required.");
    if (!taskData.name?.trim()) throw new Error("A task name is required.");
    const targetHours = taskData.targetHours ?? null;

    if (targetHours !== null && (!Number.isFinite(targetHours) || targetHours < 0)) {
        throw new Error("Target hours must be null or a non-negative number.");
    }
    const task = {
      projectId: projectId,
      parentTaskId: taskData.parentTaskId ?? null,
      name: taskData.name.trim(),
      description: taskData.description?.trim() || "",
      targetHours: taskData.targetHours ?? null,
      completed: false,
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null
    };
    const tasksCollection = collection(db, "users", userId, "tasks");
    const taskDocument = await addDoc(tasksCollection, task);
    return taskDocument.id;
    }

export async function getTasks(userId) {
    if (!userId) throw new Error("A signed-in user is required.");
    const tasksCollection = collection(db, "users", userId, "tasks");
    const tasksQuery = query(tasksCollection, orderBy("createdAt", "asc"));
    const snapshot = await getDocs(tasksQuery);
    return snapshot.docs.map(taskDocument => ({
      id: taskDocument.id,
      ...taskDocument.data()
    }));
  }

export async function updateTask(userId, taskId, changes){
    if (!userId) throw new Error("A signed-in user is required.");
    if (!taskId) throw new Error("A task ID is required.");
    const allowedChanges = {};
    if (changes.name !== undefined) {
        const name = changes.name.trim();
        if (!name) throw new Error("A task name is required.");
        allowedChanges.name = name;
      }
    if (changes.description !== undefined) allowedChanges.description = changes.description.trim();
    if (changes.targetHours !== undefined) {
        if (changes.targetHours !== null && (!Number.isFinite(changes.targetHours) || changes.targetHours < 0)) {
          throw new Error("Target hours must be null or a non-negative number.");
        }
      
        allowedChanges.targetHours = changes.targetHours;
      }
    if (changes.archived !== undefined) allowedChanges.archived = changes.archived;
    if (changes.projectId !== undefined) allowedChanges.projectId = changes.projectId;
    if (changes.parentTaskId !== undefined) allowedChanges.parentTaskId = changes.parentTaskId;
    if (changes.completed !== undefined) allowedChanges.completed = changes.completed;
    if (changes.completedAt !== undefined) allowedChanges.completedAt = changes.completedAt;
    allowedChanges.updatedAt = serverTimestamp();
    const taskReference = doc(db, "users", userId, "tasks", taskId);
    await updateDoc(taskReference, allowedChanges);
}

export async function archiveTask(userId, taskId) {
  await updateTask(userId, taskId, { archived: true });
}

export async function restoreTask(userId, taskId) {
  await updateTask(userId, taskId, { archived: false });
}

export async function completeTask(userId, taskId) {
    await updateTask(userId, taskId, { completed: true, completedAt: serverTimestamp() });
}
  
export async function reopenTask(userId, taskId) {
    await updateTask(userId, taskId, { completed: false, completedAt: null });
}