use std::io::{self, BufRead, Write};

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut reader = stdin.lock();
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let response = rift_sidecar::handle_line(&line);
                if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
                    break;
                }
            }
        }
    }
}
