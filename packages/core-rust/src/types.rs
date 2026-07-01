use napi_derive::napi;

#[napi(object)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub modified_at: i64,
}
