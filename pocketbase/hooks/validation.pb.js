// Model hooks cover dashboard/API writes and internal save()/validate() calls.
// saveNoValidate() bypasses these checks and must not be used for application data.
onRecordValidate((e) => {
    require(__hooks + "/validation.js").validateSnapshot(e.record);
    e.next();
}, "snapshots");

onRecordValidate((e) => {
    require(__hooks + "/validation.js").validateArtist(e.record);
    e.next();
}, "artists");

onRecordValidate((e) => {
    require(__hooks + "/validation.js").validateSongSnapshot(e.record);
    e.next();
}, "song_snapshots");
