use tauri::Manager;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let t0 = now_ms();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![debug_log])
        .setup(move |app| {
            let t_setup = now_ms();
            eprintln!("[dbg] setup: entered ({t_setup})");
            debug_write(&format!("T0={t0} setup_entered={t_setup}"));
            // Cover the whole monitor so notes can float anywhere and the
            // transparent/click-through background covers everything behind it.
            // No sleeps needed: the window already exists by the time `setup`
            // runs, so just resize it synchronously.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.primary_monitor() {
                    let size = monitor.size();
                    let pos = monitor.position();
                    let r1 = win.set_size(*size);
                    let r2 = win.set_position(*pos);
                    debug_write(&format!("resized_t={}", now_ms()));
                    let outer = win.outer_size().map(|s| format!("{}x{}", s.width, s.height)).unwrap_or_default();
                    debug_write(&format!(
                        "setup: monitor={}x{}@{} set_size={r1:?} set_pos={r2:?} final_outer={outer}",
                        size.width, size.height, format!("{}", pos.x)
                    ));
                } else {
                    debug_write("setup: no primary monitor");
                }
            } else {
                debug_write("setup: no main webview window");
            }

            // Poll the global cursor so the click-through window can toggle
            // mouse capture only when hovering a note.
            #[cfg(target_os = "windows")]
            start_mouse_poll(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Writes a debug line to a file so we can inspect frontend state from the shell.
fn debug_write(line: &str) {
    use std::io::Write;
    let path = r".\debug_dump.txt"; // relative to the app's working directory
    match std::fs::OpenOptions::new().create(true).append(true).open(path)
        .and_then(|mut f| writeln!(f, "{line}"))
    {
        Ok(_) => {}
        Err(e) => {
            // Last-resort: print (may be invisible for GUI apps).
            println!("[dbg-write-fail] {e}");
        }
    }
}

#[tauri::command]
fn debug_log(line: String) {
    debug_write(&line);
}

// Polls global cursor position (device px) every ~16ms and emits it to the
// frontend. Used as an alternative to browser mousemove because a click-through
// window (set_ignore_cursor_events = true) does not receive mouse events.
#[cfg(target_os = "windows")]
fn start_mouse_poll(app: tauri::AppHandle) {
    use std::thread;
    use std::time::Duration;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    thread::spawn(move || {
        let mut tick = 0u32;
        loop {
            thread::sleep(Duration::from_millis(16));
            tick += 1;
            if tick % 60 == 0 {
                eprintln!("[dbg] poll: heartbeat");
                debug_write("poll: heartbeat");
            }
            let mut pt = POINT { x: 0, y: 0 };
            if unsafe { GetCursorPos(&mut pt) } == 0 {
                continue;
            }
            let _ = app.emit("device-mouse-move", (pt.x, pt.y));
        }
    });
}
