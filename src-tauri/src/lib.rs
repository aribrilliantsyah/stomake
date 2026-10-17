//! Desktop shell: starts the bundled Node server (Hono + Playwright) on a free localhost port,
//! then shows it in the app window. The web app is the same as in the browser; Tauri adds native
//! folder/file dialogs and opening PDFs in the OS viewer.

use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use parking_lot::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

struct Server(Mutex<Option<Child>>);

/// Port 5178 like `pnpm start` (so the MCP url agents know keeps working); any free port if taken.
fn pick_port() -> u16 {
    if TcpListener::bind(("127.0.0.1", 5178)).is_ok() {
        return 5178;
    }
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .expect("no free localhost port")
}

/// Bundled node next to the server script; falls back to `node` on PATH (dev builds).
fn node_binary(resources: &Path) -> PathBuf {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    let bundled = resources.join("node").join(name);
    if bundled.exists() {
        bundled
    } else {
        PathBuf::from(name)
    }
}

fn spawn_server(resources: &Path, port: u16) -> std::io::Result<Child> {
    let mut cmd = Command::new(node_binary(resources));
    cmd.arg(resources.join("server").join("main.mjs"))
        // relative lookups (dist, node_modules/playwright) resolve inside the app's resources
        .current_dir(resources)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("STORYBOARD_DIST", resources.join("dist"))
        // the headless shell downloaded on first export lives in the user's cache, not the app bundle
        .env_remove("PLAYWRIGHT_BROWSERS_PATH")
        .env("STORYBOARD_PARENT_PIPE", "1")
        // the server exits when this pipe closes, i.e. whenever the app dies (crash, kill, logout)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::process::CommandExt;
        // also let the kernel SIGTERM the server if the app is killed outright
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn()?;
    // forward server logs so `tauri dev` shows them; also keeps the pipe drained
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                println!("[server] {line}");
            }
        });
    }
    Ok(child)
}

fn wait_until_listening(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(200)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let resources = app.path().resource_dir()?.join("resources");
            let port = pick_port();
            let child = spawn_server(&resources, port).map_err(|e| format!("Server tidak bisa dijalankan ({}): {e}", resources.display()))?;
            app.manage(Server(Mutex::new(Some(child))));
            if !wait_until_listening(port, Duration::from_secs(30)) {
                return Err("Server tidak merespons dalam 30 detik".into());
            }
            let url = Url::parse(&format!("http://127.0.0.1:{port}/"))?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Storyboard Maker")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                // native file-drop interception swallows HTML5 drag & drop (layers, slides, asset tiles)
                .disable_drag_drop_handler()
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Storyboard Maker");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut child) = handle.state::<Server>().0.lock().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
