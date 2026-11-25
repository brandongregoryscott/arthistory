import type * as Validation from "./validation.js";

// Model hooks cover dashboard/API writes and internal save()/validate() calls.
// saveNoValidate() bypasses these checks and must not be used for application data.
onRecordValidate((e) => {
    (require(__hooks + "/validation.js") as typeof Validation).validateSnapshot(
        e.record as core.Record
    );
    e.next();
}, "snapshots");

onRecordValidate((e) => {
    (require(__hooks + "/validation.js") as typeof Validation).validateArtist(
        e.record as core.Record
    );
    e.next();
}, "artists");

onRecordValidate((e) => {
    (
        require(__hooks + "/validation.js") as typeof Validation
    ).validateSongSnapshot(e.record as core.Record);
    e.next();
}, "song_snapshots");
