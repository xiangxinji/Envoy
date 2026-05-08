## ADDED Requirements

### Requirement: Team SHALL store resources as files on disk
Team SHALL manage a configurable root directory (default: `resources/`) for storing Markdown resource files. Each resource is identified by a relative path (e.g., `workflow/etl.md`) and stored as a file at `<root>/<path>`.

#### Scenario: Resource stored at specified path
- **WHEN** a leader registers a resource with path `workflow/etl.md` and content `# ETL Pipeline`
- **THEN** Team SHALL create the file at `<root>/workflow/etl.md` with the specified content

#### Scenario: Nested directory auto-created
- **WHEN** a leader registers a resource with path `knowledge/api/guide.md`
- **THEN** Team SHALL create intermediate directories `knowledge/api/` if they do not exist

### Requirement: Team SHALL validate resource paths
Team SHALL reject resource paths that contain `..` segments, absolute paths, or null bytes to prevent directory traversal attacks.

#### Scenario: Path traversal blocked
- **WHEN** a resource operation requests path `../../etc/passwd`
- **THEN** Team SHALL reject the operation and return an error

#### Scenario: Absolute path blocked
- **WHEN** a resource operation requests path `/etc/passwd`
- **THEN** Team SHALL reject the operation and return an error

### Requirement: Leader SHALL register resources
Leader SHALL send a `resource:register` notify to Team with `{ path: string, content: string }`. Team SHALL create or update the file and broadcast a `resource:changed` notification to all Members with `{ action: "created" | "updated", path }`.

#### Scenario: New resource registration
- **WHEN** Leader registers a resource that does not exist
- **THEN** Team SHALL create the file, send `resource:ack` to Leader, and broadcast `resource:changed` with `action: "created"` to all Members

#### Scenario: Existing resource update
- **WHEN** Leader registers a resource that already exists
- **THEN** Team SHALL overwrite the file, send `resource:ack` to Leader, and broadcast `resource:changed` with `action: "updated"` to all Members

### Requirement: Leader SHALL delete resources
Leader SHALL send a `resource:delete` notify to Team with `{ path: string }`. Team SHALL remove the file and broadcast a `resource:changed` notification with `{ action: "deleted", path }`.

#### Scenario: Delete existing resource
- **WHEN** Leader deletes a resource that exists
- **THEN** Team SHALL remove the file, send `resource:ack` to Leader, and broadcast `resource:changed` with `action: "deleted"` to all Members

#### Scenario: Delete non-existent resource
- **WHEN** Leader deletes a resource that does not exist
- **THEN** Team SHALL send `resource:ack` with a not-found indicator to Leader

### Requirement: Member SHALL query resource list
Member SHALL send a `resource:query` notify to Team with `{ type: "list" }`. Team SHALL return a list of all resource paths.

#### Scenario: List all resources
- **WHEN** Member queries the resource list
- **THEN** Team SHALL return all resource paths relative to the root directory, recursively

### Requirement: Member SHALL query resource content
Member SHALL send a `resource:query` notify to Team with `{ type: "get", path: string }`. Team SHALL return the file content.

#### Scenario: Get existing resource
- **WHEN** Member queries resource `workflow/etl.md` that exists
- **THEN** Team SHALL return the file content as a string

#### Scenario: Get non-existent resource
- **WHEN** Member queries a resource that does not exist
- **THEN** Team SHALL return an error indicating resource not found

### Requirement: Team SHALL broadcast resource changes to all Members
When any resource is created, updated, or deleted by a Leader, Team SHALL send a `resource:changed` notification to every connected Member.

#### Scenario: Broadcast on resource creation
- **WHEN** Leader creates a new resource
- **THEN** all connected Members SHALL receive a `resource:changed` notification with `{ action: "created", path }`

#### Scenario: Broadcast on resource update
- **WHEN** Leader updates an existing resource
- **THEN** all connected Members SHALL receive a `resource:changed` notification with `{ action: "updated", path }`

#### Scenario: Broadcast on resource deletion
- **WHEN** Leader deletes a resource
- **THEN** all connected Members SHALL receive a `resource:changed` notification with `{ action: "deleted", path }`

### Requirement: Team SHALL load existing resources on startup
When Team starts, it SHALL scan the resource root directory and index all existing Markdown files.

#### Scenario: Startup with existing resources
- **WHEN** Team starts and `resources/` directory contains files
- **THEN** those files SHALL be available for query immediately
