export default class App {
    constructor() {
        this.notes = JSON.parse(localStorage.getItem('notes') || "[]");
        this.activeNote = null;

        this.$addBtn = document.getElementById('add-note-btn');
        this.$deleteBtn = document.getElementById('delete-note-btn');
        this.$notesList = document.getElementById('notes-list');
        this.$titleInput = document.getElementById('note-title');
        this.$bodyInput = document.getElementById('note-body');

        this.addEventListeners();
        this.refreshNotes();

        if (this.notes.length > 0) {
            this.setActiveNote(this.notes[0]);
        }
    }

    addEventListeners() {
        this.$addBtn.addEventListener('click', () => {
            this.addNote();
        });

        this.$deleteBtn.addEventListener('click', () => {
            this.deleteNote(this.activeNote);
        });

        this.$titleInput.addEventListener('input', () => {
            this.saveActiveNote();
        });

        this.$bodyInput.addEventListener('input', () => {
            this.saveActiveNote();
        });
    }

    saveActiveNote() {
        if (!this.activeNote) return;

        this.activeNote.title = this.$titleInput.value;
        this.activeNote.body = this.$bodyInput.value;
        this.activeNote.updated = new Date().toISOString();

        this.saveNotes();
        this.refreshNotes(); // To update sidebar preview
    }

    saveNotes() {
        localStorage.setItem('notes', JSON.stringify(this.notes));
    }

    addNote() {
        const newNote = {
            id: Math.floor(Math.random() * 1000000),
            title: "Untitled Note",
            body: "",
            updated: new Date().toISOString()
        };

        this.notes.unshift(newNote); // Add to top
        this.saveNotes();
        this.refreshNotes();
        this.setActiveNote(newNote);
    }

    deleteNote(noteToDelete) {
        if (!noteToDelete) return;

        const doDelete = confirm("Are you sure you want to delete this note?");
        if (!doDelete) return;

        this.notes = this.notes.filter(note => note.id != noteToDelete.id);
        this.saveNotes();
        this.refreshNotes();

        if (this.notes.length > 0) {
            this.setActiveNote(this.notes[0]);
        } else {
            this.activeNote = null;
            this.$titleInput.value = "";
            this.$bodyInput.value = "";
        }
    }

    setActiveNote(note) {
        this.activeNote = note;
        this.$titleInput.value = note.title;
        this.$bodyInput.value = note.body;

        // Update UI selection
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.noteId == note.id) {
                item.classList.add('selected');
            }
        });
    }

    refreshNotes() {
        this.$notesList.innerHTML = "";

        this.notes.forEach(note => {
            const date = new Date(note.updated).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short"
            });

            const html = `
                <div class="note-item ${this.activeNote && this.activeNote.id === note.id ? 'selected' : ''}" data-note-id="${note.id}">
                    <div class="note-item-title">${note.title}</div>
                    <div class="note-item-body">${note.body || "Empty note..."}</div>
                    <time class="note-item-date">${date}</time>
                </div>
            `;

            this.$notesList.insertAdjacentHTML('beforeend', html);
        });

        // Re-attach click listeners
        document.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const noteId = item.dataset.noteId;
                const note = this.notes.find(n => n.id == noteId);
                this.setActiveNote(note);
            });
        });
    }
}

new App();
