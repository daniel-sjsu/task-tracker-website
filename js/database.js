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


