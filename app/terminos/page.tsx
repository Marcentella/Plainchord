export const metadata = { title: "Términos de Servicio | PlainChord" };

export default function Terminos() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <article className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-medium">Términos de Servicio | PlainChord</h1>
          <p className="text-xs text-muted mt-1">
            Última actualización: 12 de septiembre de 2026
          </p>
        </div>

        <p className="text-sm">
          Estos Términos de Servicio (&quot;Términos&quot;) rigen el uso de
          PlainChord (&quot;la Aplicación&quot;, &quot;el Servicio&quot;). Al
          usar la Aplicación, aceptas estos Términos.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">1. Descripción del servicio</h2>
          <p className="text-sm">
            PlainChord es una herramienta de referencia visual para el
            aprendizaje de guitarra. Permite consultar una biblioteca de
            acordes, un glosario de notación técnica, y clasificar la
            dificultad de transiciones entre acordes. PlainChord también
            permite importar y visualizar tablaturas proporcionadas por el
            propio usuario.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            2. Contenido importado por el usuario
          </h2>
          <p className="text-sm">
            PlainChord no proporciona, aloja, indexa ni distribuye tablaturas de
            canciones protegidas por derechos de autor.
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>
              Cualquier tablatura, archivo o contenido que el usuario importe
              a la Aplicación es proporcionado voluntariamente por el
              usuario, para su uso personal.
            </li>
            <li>
              El usuario es el único responsable de asegurarse de tener el
              derecho legal para usar y visualizar dicho contenido.
            </li>
            <li>
              El contenido importado se procesa localmente y no se comparte
              con otros usuarios ni se almacena en servidores de PlainChord con
              fines de distribución.
            </li>
            <li>
              PlainChord no revisa, verifica ni se hace responsable del origen
              o legalidad del contenido importado por los usuarios.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">3. Uso aceptable</h2>
          <p className="text-sm">
            El usuario se compromete a no utilizar PlainChord para:
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>
              Distribuir, compartir o publicar contenido protegido por
              derechos de autor sin autorización.
            </li>
            <li>
              Intentar utilizar la Aplicación como medio para facilitar la
              infracción de derechos de autor de terceros.
            </li>
            <li>
              Realizar ingeniería inversa, scraping, o uso automatizado no
              autorizado del Servicio.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">4. Plan gratuito y premium</h2>
          <p className="text-sm">
            Las funciones descritas como &quot;Plan gratuito&quot; están
            disponibles sin costo. Las funciones marcadas como
            &quot;Premium (próximamente)&quot; no están actualmente
            disponibles ni se cobra por ellas; su disponibilidad y
            condiciones futuras se comunicarán oportunamente.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">5. Sin garantías</h2>
          <p className="text-sm">
            La Aplicación se proporciona &quot;tal cual&quot;. PlainChord no
            garantiza que la información (diagramas de acordes, notación,
            cálculos de dificultad, o resultados de detección de acordes por
            audio) sea exacta al 100% en todos los casos, especialmente en
            componentes marcados como exploratorios o en desarrollo (I+D).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            6. Limitación de responsabilidad
          </h2>
          <p className="text-sm">
            En la medida permitida por la ley, PlainChord y su desarrollador no
            serán responsables por daños derivados del uso del Servicio,
            incluyendo pero no limitado a contenido importado por el usuario.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">7. Cambios a estos Términos</h2>
          <p className="text-sm">
            Estos Términos pueden actualizarse. El uso continuado de la
            Aplicación tras una actualización constituye aceptación de los
            nuevos Términos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">8. Contacto</h2>
          <p className="text-sm">
            Para consultas sobre estos Términos: example@placeholder.app
          </p>
        </section>

        <p className="text-xs text-muted border-t border-line pt-4">
          Nota: estos Términos pueden actualizarse a medida que PlainChord
          incorpore nuevas funciones (por ejemplo, cuentas de usuario o
          pagos). Te recomendamos revisarlos de vez en cuando.
        </p>
      </article>
    </div>
  );
}
