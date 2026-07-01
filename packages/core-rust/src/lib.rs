use napi_derive::napi;

mod adapters;
mod types;

#[napi]
pub fn ping(message: String) -> String {
    format!("pong: {}", message)
}

#[napi]
pub fn search_files(query: String) -> Vec<types::FileInfo> {
    // Phase F2 stub — macOS Spotlight implementation comes later
    vec![]
}
