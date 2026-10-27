use std::cell::Cell;
use std::rc::Rc;

use gtk::prelude::*;
use serde::Serialize;
use tauri::{Emitter, WebviewWindow};

#[derive(Clone, Serialize)]
struct DropPosition {
    x: i32,
    y: i32,
}

#[derive(Clone, Serialize)]
struct FileDrop {
    uris: Vec<String>,
    position: DropPosition,
}

/// Handle only OS URI drops; leave drags originating in this GTK process to WebKit's HTML5 DnD.
pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let event_window = window.clone();
    window.with_webview(move |webview| {
        let widget = webview.inner();
        let pending_drop = Rc::new(Cell::new(false));
        let requested_drop = pending_drop.clone();

        widget.connect_drag_drop(move |widget, context, _, _, time| {
            if context.drag_get_source_widget().is_some() {
                return false;
            }
            let target = gtk::gdk::Atom::intern("text/uri-list");
            if !context.list_targets().contains(&target) {
                return false;
            }
            requested_drop.set(true);
            widget.drag_get_data(context, &target, time);
            true
        });

        widget.connect_drag_data_received(move |widget, context, x, y, data, _, time| {
            if context.drag_get_source_widget().is_some()
                || data.target() != gtk::gdk::Atom::intern("text/uri-list")
                || !pending_drop.replace(false)
            {
                return;
            }
            // Prevent WebKit's default handler from navigating to the dropped file.
            widget.stop_signal_emission_by_name("drag-data-received");
            let uris: Vec<String> = data.uris().into_iter().map(String::from).collect();
            let success = !uris.is_empty()
                && event_window
                    .emit(
                        "storyboard://file-drop",
                        FileDrop {
                            uris,
                            position: DropPosition { x, y },
                        },
                    )
                    .is_ok();
            context.drag_finish(success, false, time);
        });
    })
}
