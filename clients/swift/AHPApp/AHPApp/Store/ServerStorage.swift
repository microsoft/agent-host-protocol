import CoreData
import Foundation

/// Core Data persistence layer for saved server configurations.
final class ServerStorage {
    static let shared = ServerStorage(container: PersistenceController.shared.container)

    private let container: NSPersistentContainer
    private var viewContext: NSManagedObjectContext { container.viewContext }

    init(container: NSPersistentContainer) {
        self.container = container
    }

    // MARK: - Fetch

    func fetchServers() -> [ServerConfiguration] {
        let request = NSFetchRequest<StoredServer>(entityName: "StoredServer")
        request.sortDescriptors = [NSSortDescriptor(keyPath: \StoredServer.name, ascending: true)]

        do {
            let results = try viewContext.fetch(request)
            return results.map { stored in
                ServerConfiguration(
                    id: stored.id ?? UUID(),
                    name: stored.name ?? "",
                    scheme: stored.scheme ?? "ws",
                    host: stored.host ?? "",
                    token: stored.token ?? "",
                    tunnelId: stored.tunnelId,
                    clusterId: stored.clusterId
                )
            }
        } catch {
            return []
        }
    }

    // MARK: - Save / Update

    func saveServer(_ server: ServerConfiguration) {
        let request = NSFetchRequest<StoredServer>(entityName: "StoredServer")
        request.predicate = NSPredicate(format: "id == %@", server.id as CVarArg)

        do {
            let results = try viewContext.fetch(request)
            let stored: StoredServer
            if let existing = results.first {
                stored = existing
            } else {
                guard let entity = NSEntityDescription.entity(forEntityName: "StoredServer", in: viewContext) else { return }
                stored = StoredServer(entity: entity, insertInto: viewContext)
                stored.id = server.id
            }

            stored.name = server.name
            stored.scheme = server.scheme
            stored.host = server.host
            stored.token = server.token
            stored.tunnelId = server.tunnelId
            stored.clusterId = server.clusterId

            try viewContext.save()
        } catch {
            // Non-fatal: persistence failure
        }
    }

    // MARK: - Delete

    func deleteServer(id: UUID) {
        let request = NSFetchRequest<StoredServer>(entityName: "StoredServer")
        request.predicate = NSPredicate(format: "id == %@", id as CVarArg)

        do {
            let results = try viewContext.fetch(request)
            if let stored = results.first {
                viewContext.delete(stored)
                try viewContext.save()
            }
        } catch {
            // Non-fatal
        }
    }
}
