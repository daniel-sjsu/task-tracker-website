import { db } from "./firebase.js";
import { collection, addDoc, getDocs, getDoc, setDoc ,doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy ,where, Timestamp, onSnapshot, writeBatch} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

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

export async function deleteProjectAndData(userId, projectId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!projectId) throw new Error("A project ID is required.");

  const tasksReference = collection(db, "users", userId, "tasks");
  const sessionsReference = collection(db, "users", userId, "sessions");

  const tasksSnapshot = await getDocs(query(tasksReference, where("projectId", "==", projectId)));
  const sessionsSnapshot = await getDocs(query(sessionsReference, where("projectId", "==", projectId)));

  await Promise.all([
    ...tasksSnapshot.docs.map(taskDocument => deleteDoc(taskDocument.ref)),
    ...sessionsSnapshot.docs.map(sessionDocument => deleteDoc(sessionDocument.ref))
  ]);

  await deleteDoc(doc(db, "users", userId, "projects", projectId));
}

export async function createTag(userId, tagData) {
  if (!userId) throw new Error("A signed-in user is required.");

  const name = tagData.name?.trim();
  if (!name) throw new Error("A tag name is required.");

  const tag = {
    name,
    color: tagData.color || "#4f83cc",
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const tagsCollection = collection(db, "users", userId, "tags");
  const tagDocument = await addDoc(tagsCollection, tag);

  return tagDocument.id;
}

export async function getTags(userId) {
  if (!userId) throw new Error("A signed-in user is required.");

  const tagsCollection = collection(db, "users", userId, "tags");
  const tagsQuery = query(tagsCollection, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(tagsQuery);

  return snapshot.docs.map(tagDocument => ({
    id: tagDocument.id,
    ...tagDocument.data()
  }));
}

export async function updateTag(userId, tagId, changes) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!tagId) throw new Error("A tag ID is required.");

  const allowedChanges = {};

  if (changes.name !== undefined) {
    const name = changes.name.trim();

    if (!name) {
      throw new Error("A tag name is required.");
    }

    allowedChanges.name = name;
  }

  if (changes.color !== undefined) {
    allowedChanges.color = changes.color;
  }

  if (changes.archived !== undefined) {
    allowedChanges.archived = changes.archived;
  }

  allowedChanges.updatedAt = serverTimestamp();

  const tagReference = doc(db, "users", userId, "tags", tagId);
  await updateDoc(tagReference, allowedChanges);
}

export async function archiveTag(userId, tagId) {
  await updateTag(userId, tagId, {
    archived: true
  });
}

export async function restoreTag(userId, tagId) {
  await updateTag(userId, tagId, {
    archived: false
  });
}

export async function deleteUnusedTag(userId, tagId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!tagId) throw new Error("A tag ID is required.");

  const tasksReference = collection(db, "users", userId, "tasks");
  const sessionsReference = collection(db, "users", userId, "sessions");

  const tasksQuery = query(tasksReference, where("tagId", "==", tagId));
  const sessionsQuery = query(sessionsReference, where("tagId", "==", tagId));

  const [tasksSnapshot, sessionsSnapshot] = await Promise.all([
    getDocs(tasksQuery),
    getDocs(sessionsQuery)
  ]);

  if (!tasksSnapshot.empty || !sessionsSnapshot.empty) {
    throw new Error("This tag is still assigned to tasks or sessions and must be archived instead.");
  }

  const tagReference = doc(db, "users", userId, "tags", tagId);
  await deleteDoc(tagReference);
}

export async function createTask(userId, projectId, taskData) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!projectId) throw new Error("A project ID is required.");
  if (!taskData.name?.trim()) throw new Error("A task name is required.");

  const targetHours = taskData.targetHours ?? null;
  if (targetHours !== null && (!Number.isFinite(targetHours) || targetHours < 0)) {
    throw new Error("Target hours must be null or a non-negative number.");
  }

  const task = {
    projectId,
    parentTaskId: taskData.parentTaskId ?? null,
    name: taskData.name.trim(),
    description: taskData.description?.trim() || "",
    targetHours,
    tagId: taskData.tagId ?? null,
    tagName: taskData.tagName?.trim() || null,
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

export async function updateTask(userId, taskId, changes) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!taskId) throw new Error("A task ID is required.");

  const allowedChanges = {};

  if (changes.name !== undefined) {
    const name = changes.name.trim();
    if (!name) throw new Error("A task name is required.");
    allowedChanges.name = name;
  }

  if (changes.description !== undefined) allowedChanges.description = changes.description.trim();
  if (changes.projectId !== undefined) allowedChanges.projectId = changes.projectId;
  if (changes.parentTaskId !== undefined) allowedChanges.parentTaskId = changes.parentTaskId;
  if (changes.tagId !== undefined) allowedChanges.tagId = changes.tagId;
  if (changes.tagName !== undefined) allowedChanges.tagName = changes.tagName?.trim() || null;

  if (changes.targetHours !== undefined) {
    if (changes.targetHours !== null && (!Number.isFinite(changes.targetHours) || changes.targetHours < 0)) {
      throw new Error("Target hours must be null or a non-negative number.");
    }

    allowedChanges.targetHours = changes.targetHours;
  }

  if (changes.completed !== undefined) allowedChanges.completed = changes.completed;
  if (changes.completedAt !== undefined) allowedChanges.completedAt = changes.completedAt;
  if (changes.archived !== undefined) allowedChanges.archived = changes.archived;

  allowedChanges.updatedAt = serverTimestamp();

  const taskReference = doc(db, "users", userId, "tasks", taskId);
  await updateDoc(taskReference, allowedChanges);
}
export async function createTaskNote(userId, noteData) {
  const notesRef = collection(db, "users", userId, "taskNotes");

  return addDoc(notesRef, {
    taskId: noteData.taskId,
    text: noteData.text,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function getTaskNotes(userId) {
  const notesRef = collection(db, "users", userId, "taskNotes");
  const notesQuery = query(notesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(notesQuery);

  return snapshot.docs.map(noteDocument => ({
    id: noteDocument.id,
    ...noteDocument.data()
  }));
}
export async function updateTaskNote(userId, noteId, noteData) {
  const noteRef = doc(db, "users", userId, "taskNotes", noteId);

  await updateDoc(noteRef, {
    text: noteData.text,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTaskNote(userId, noteId) {
  const noteRef = doc(db, "users", userId, "taskNotes", noteId);
  await deleteDoc(noteRef);
}
export async function completeTask(userId, taskId) {
  await updateTask(userId, taskId, { completed: true, completedAt: serverTimestamp() });
}

export async function reopenTask(userId, taskId) {
  await updateTask(userId, taskId, { completed: false, completedAt: null });
}

export async function archiveTask(userId, taskId) {
  await updateTask(userId, taskId, { archived: true });
}

export async function restoreArchivedTask(userId, taskId) {
  await updateTask(userId, taskId, { archived: false });
}

export async function deleteTask(userId, taskId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!taskId) throw new Error("A task ID is required.");

  const taskReference = doc(db, "users", userId, "tasks", taskId);
  await deleteDoc(taskReference);
}

export async function createSession(userId, sessionData) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!sessionData.projectId) throw new Error("A project ID is required.");
  if (!sessionData.taskId) throw new Error("A task ID is required.");
  if (!sessionData.start) throw new Error("A session start time is required.");
  if (!sessionData.end) throw new Error("A session end time is required.");

  const start = sessionData.start instanceof Date ? Timestamp.fromDate(sessionData.start) : sessionData.start;
  const end = sessionData.end instanceof Date ? Timestamp.fromDate(sessionData.end) : sessionData.end;
  const durationSeconds = (end.toMillis() - start.toMillis()) / 1000;

  if (durationSeconds <= 0) throw new Error("The session end time must be after the start time.");

  const session = {
    projectId: sessionData.projectId,
    taskId: sessionData.taskId,
    projectName: sessionData.projectName?.trim() || "",
    taskName: sessionData.taskName?.trim() || "",
    tagId: sessionData.tagId ?? null,
    tagName: sessionData.tagName?.trim() || null,
    start,
    end,
    durationSeconds,
    note: sessionData.note?.trim() || "",
    source: sessionData.source || "timer",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const sessionsCollection = collection(db, "users", userId, "sessions");
  const sessionDocument = await addDoc(sessionsCollection, session);
  return sessionDocument.id;
}

export async function getSessions(userId) {
  if (!userId) throw new Error("A signed-in user is required.");

  const sessionsCollection = collection(db, "users", userId, "sessions");
  const sessionsQuery = query(sessionsCollection, orderBy("start", "desc"));
  const snapshot = await getDocs(sessionsQuery);

  return snapshot.docs.map(sessionDocument => ({
    id: sessionDocument.id,
    ...sessionDocument.data()
  }));
}

export async function getSessionsByProject(userId, projectId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!projectId) throw new Error("A project ID is required.");

  const sessionsCollection = collection(db, "users", userId, "sessions");
  const sessionsQuery = query(sessionsCollection, where("projectId", "==", projectId), orderBy("start", "desc"));
  const snapshot = await getDocs(sessionsQuery);

  return snapshot.docs.map(sessionDocument => ({
    id: sessionDocument.id,
    ...sessionDocument.data()
  }));
}

export async function updateSession(userId, sessionId, changes) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!sessionId) throw new Error("A session ID is required.");

  const allowedChanges = {};

  if (changes.projectId !== undefined) allowedChanges.projectId = changes.projectId;
  if (changes.taskId !== undefined) allowedChanges.taskId = changes.taskId;
  if (changes.projectName !== undefined) allowedChanges.projectName = changes.projectName.trim();
  if (changes.taskName !== undefined) allowedChanges.taskName = changes.taskName.trim();
  if (changes.tagId !== undefined) allowedChanges.tagId = changes.tagId;
  if (changes.tagName !== undefined) allowedChanges.tagName = changes.tagName?.trim() || null;
  if (changes.note !== undefined) allowedChanges.note = changes.note.trim();
  if (changes.source !== undefined) allowedChanges.source = changes.source;

  let start = changes.start;
  let end = changes.end;

  if (start instanceof Date) start = Timestamp.fromDate(start);
  if (end instanceof Date) end = Timestamp.fromDate(end);

  if (start !== undefined) allowedChanges.start = start;
  if (end !== undefined) allowedChanges.end = end;

  if (start !== undefined || end !== undefined) {
    const sessionReference = doc(db, "users", userId, "sessions", sessionId);
    const existingSession = await getDoc(sessionReference);

    if (!existingSession.exists()) throw new Error("The session does not exist.");

    const currentData = existingSession.data();
    const finalStart = start ?? currentData.start;
    const finalEnd = end ?? currentData.end;
    const durationSeconds = (finalEnd.toMillis() - finalStart.toMillis()) / 1000;

    if (durationSeconds <= 0) throw new Error("The session end time must be after the start time.");

    allowedChanges.durationSeconds = durationSeconds;
  }

  allowedChanges.updatedAt = serverTimestamp();

  const sessionReference = doc(db, "users", userId, "sessions", sessionId);
  await updateDoc(sessionReference, allowedChanges);
}

export async function deleteSession(userId, sessionId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!sessionId) throw new Error("A session ID is required.");

  const sessionReference = doc(db, "users", userId, "sessions", sessionId);
  await deleteDoc(sessionReference);
}

export async function getTimerState(userId) {
  if (!userId) throw new Error("A signed-in user is required.");

  const stateReference = doc(db, "users", userId, "app", "state");
  const snapshot = await getDoc(stateReference);

  if (!snapshot.exists()) {
    return {
      runningTaskId: null,
      runningProjectId: null,
      startTime: null
    };
  }

  const data = snapshot.data();

  return {
    runningTaskId: data.runningTaskId ?? null,
    runningProjectId: data.runningProjectId ?? null,
    startTime: data.startTime?.toMillis ? data.startTime.toMillis() : data.startTime ?? null
  };
}

export async function saveTimerState(userId, stateData) {
  if (!userId) throw new Error("A signed-in user is required.");

  const startTime = stateData.startTime instanceof Date
    ? Timestamp.fromDate(stateData.startTime)
    : stateData.startTime !== null
      ? Timestamp.fromMillis(stateData.startTime)
      : null;

  const stateReference = doc(db, "users", userId, "app", "state");

  await setDoc(stateReference, {
    runningTaskId: stateData.runningTaskId ?? null,
    runningProjectId: stateData.runningProjectId ?? null,
    startTime,
    updatedAt: serverTimestamp()
  });
}

export function listenToTimerState(userId, onChange, onError) {
  if (!userId) throw new Error("A signed-in user is required.");

  const stateReference = doc(db, "users", userId, "app", "state");

  return onSnapshot(stateReference, snapshot => {
    if (!snapshot.exists()) {
      onChange({
        runningTaskId: null,
        runningProjectId: null,
        startTime: null
      });
      return;
    }

    const data = snapshot.data();

    onChange({
      runningTaskId: data.runningTaskId ?? null,
      runningProjectId: data.runningProjectId ?? null,
      startTime: data.startTime?.toMillis ? data.startTime.toMillis() : data.startTime ?? null
    });
  }, error => {
    console.error("Timer state listener failed:", error);
    if (onError) onError(error);
  });
}

export async function deleteSessionsByTask(userId, taskId) {
  if (!userId) throw new Error("A signed-in user is required.");
  if (!taskId) throw new Error("A task ID is required.");

  const sessionsReference = collection(db, "users", userId, "sessions");
  const sessionsQuery = query(sessionsReference, where("taskId", "==", taskId));
  const snapshot = await getDocs(sessionsQuery);

  await Promise.all(snapshot.docs.map(sessionDocument => deleteDoc(sessionDocument.ref)));
}

export async function moveTaskSessionsToProject(userId, taskId, project) {
  const sessionsRef = collection(db, "users", userId, "sessions");
  const taskSessionsQuery = query(sessionsRef, where("taskId", "==", taskId));
  const snapshot = await getDocs(taskSessionsQuery);

  const documents = snapshot.docs;

  for (let index = 0; index < documents.length; index += 500) {
    const batch = writeBatch(db);
    const chunk = documents.slice(index, index + 500);

    chunk.forEach(sessionDocument => {
      batch.update(doc(db, "users", userId, "sessions", sessionDocument.id), {
        projectId: project.id,
        projectName: project.name,
        updatedAt: serverTimestamp()
      });
    });

    await batch.commit();
  }
}