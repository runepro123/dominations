#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Auto-update + persistent settings store. Both plugins are registered
      // in release builds too — the auto-updater is the whole point, and we
      // want settings.dat ready before the UI asks for it.
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      app.handle().plugin(tauri_plugin_store::Builder::new().build())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
