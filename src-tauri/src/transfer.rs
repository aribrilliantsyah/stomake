use serde::Serialize;
use tauri::Url;

#[derive(Serialize)]
pub struct LocalImage {
    name: String,
    mime: &'static str,
    bytes: Vec<u8>,
}

#[tauri::command]
pub fn read_local_images(uris: Vec<String>) -> Result<Vec<LocalImage>, String> {
    uris.into_iter()
        .map(|uri| {
            let url = Url::parse(&uri).map_err(|error| format!("Invalid image URI: {error}"))?;
            if url.scheme() != "file"
                || url.host_str().is_some_and(|host| host != "localhost")
            {
                return Err("Only local file:// image URIs are supported".to_owned());
            }
            let path = url
                .to_file_path()
                .map_err(|_| "Image URI is not a local file path".to_owned())?;
            let extension = path
                .extension()
                .and_then(|extension| extension.to_str())
                .ok_or_else(|| "Image file must have a supported extension".to_owned())?;
            let mime = if extension.eq_ignore_ascii_case("png") {
                "image/png"
            } else if extension.eq_ignore_ascii_case("jpg")
                || extension.eq_ignore_ascii_case("jpeg")
            {
                "image/jpeg"
            } else if extension.eq_ignore_ascii_case("gif") {
                "image/gif"
            } else if extension.eq_ignore_ascii_case("webp") {
                "image/webp"
            } else {
                return Err("Only PNG, JPG, JPEG, GIF, and WebP image files are supported".to_owned());
            };
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| "Image URI must have a valid file name".to_owned())?
                .to_owned();
            let bytes = std::fs::read(&path)
                .map_err(|error| format!("Could not read image {}: {error}", path.display()))?;
            Ok(LocalImage { name, mime, bytes })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "storyboard-transfer-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_encoded_unicode_and_spaces_with_original_name() {
        let directory = TestDirectory::new();
        let path = directory.0.join("gambar café 日本.PNG");
        std::fs::write(&path, [1, 2, 3]).unwrap();
        let uri = tauri::Url::from_file_path(path).unwrap().to_string();
        assert!(uri.contains("%20"));
        assert!(uri.contains("%"));

        let images = read_local_images(vec![uri]).unwrap();
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].name, "gambar café 日本.PNG");
        assert_eq!(images[0].mime, "image/png");
        assert_eq!(images[0].bytes, [1, 2, 3]);
    }

    #[test]
    fn rejects_remote_and_non_file_urls() {
        for uri in [
            "file://remote.example/image.png",
            "https://example.com/image.png",
            "data:image/png;base64,AQID",
            "not a URL",
        ] {
            assert!(read_local_images(vec![uri.to_owned()]).is_err(), "{uri}");
        }
    }

    #[test]
    fn rejects_non_image_files_even_when_readable() {
        let directory = TestDirectory::new();
        let path = directory.0.join("private.txt");
        std::fs::write(&path, "private data").unwrap();
        let uri = tauri::Url::from_file_path(path).unwrap().to_string();
        assert!(read_local_images(vec![uri]).is_err());
    }

    #[test]
    fn maps_all_allowed_extensions_case_insensitively() {
        let directory = TestDirectory::new();
        for (extension, mime) in [
            ("pNg", "image/png"),
            ("JPG", "image/jpeg"),
            ("jPeG", "image/jpeg"),
            ("GIF", "image/gif"),
            ("WebP", "image/webp"),
        ] {
            let path = directory.0.join(format!("image.{extension}"));
            std::fs::write(&path, [9]).unwrap();
            let uri = tauri::Url::from_file_path(path).unwrap().to_string();
            let images = read_local_images(vec![uri]).unwrap();
            assert_eq!(images[0].mime, mime);
            assert_eq!(images[0].bytes, [9]);
        }
    }

    #[test]
    fn fails_entire_request_on_unreadable_image() {
        let directory = TestDirectory::new();
        let present = directory.0.join("present.png");
        std::fs::write(&present, [1]).unwrap();
        let missing = directory.0.join("missing.png");
        let uris = [present, missing]
            .into_iter()
            .map(|path| tauri::Url::from_file_path(path).unwrap().to_string())
            .collect();
        assert!(read_local_images(uris).is_err());
    }
}
