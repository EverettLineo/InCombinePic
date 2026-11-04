// release 构建下不额外弹出控制台窗口，此行不可删除
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pintu_lib::run()
}
