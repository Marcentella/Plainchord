export const metadata = { title: "Política de Privacidad | PlainChord" };

export default function Privacidad() {
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <article className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-medium">Política de Privacidad | PlainChord</h1>
          <p className="text-xs text-muted mt-1">
            Última actualización: 12 de septiembre de 2026
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">1. Qué datos recopila PlainChord</h2>
          <p className="text-sm">
            Las funciones gratuitas de PlainChord (biblioteca de acordes,
            glosario, sistema de dificultad) no requieren crear una cuenta y
            no recopilan datos personales para funcionar.
          </p>
          <p className="text-sm">
            Si en el futuro se habilita inicio de sesión (por ejemplo, con
            Google) para acceder a funciones premium, se recopilará
            únicamente la información básica necesaria para identificar la
            cuenta (nombre y correo asociado), y se actualizará esta política
            antes de activar dicha función.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            2. Audio (detección de acordes, componente exploratorio)
          </h2>
          <p className="text-sm">
            El componente de detección de acordes a partir de audio procesa
            el sonido directamente en el navegador del usuario, mediante Web
            Audio API y la librería Meyda. El audio no se envía ni se
            almacena en ningún servidor. Una vez cerrada o recargada la
            página, el audio procesado no persiste en ningún lugar
            controlado por PlainChord.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">
            3. Contenido importado por el usuario (tablaturas)
          </h2>
          <p className="text-sm">
            Cualquier tablatura o archivo que el usuario importe a la
            Aplicación se trata como contenido personal del usuario:
          </p>
          <ul className="text-sm list-disc pl-5 flex flex-col gap-1">
            <li>No se comparte con otros usuarios.</li>
            <li>No se revisa manualmente por PlainChord.</li>
            <li>
              El usuario es responsable de dicho contenido, según se detalla
              en los Términos de Servicio.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">4. Cookies y analítica</h2>
          <p className="text-sm">
            Actualmente PlainChord no utiliza cookies de rastreo ni
            herramientas de analítica. Si se integra alguna en el futuro
            (por ejemplo, analítica básica de Vercel), esta sección se
            actualizará para detallar qué se mide y si los datos son
            anónimos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">5. Servicios de terceros</h2>
          <p className="text-sm">
            PlainChord puede utilizar servicios de terceros para su
            funcionamiento técnico (por ejemplo, Vercel para hosting). Estos
            servicios pueden procesar datos técnicos básicos (como
            direcciones IP) según sus propias políticas de privacidad.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">6. Derechos del usuario</h2>
          <p className="text-sm">
            El usuario puede solicitar información sobre los datos que
            PlainChord pueda tener asociados a su cuenta (si aplica), y
            solicitar su eliminación, escribiendo a example@placeholder.app.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">7. Menores de edad</h2>
          <p className="text-sm">
            PlainChord no está dirigido específicamente a menores de 13 años y
            no recopila conscientemente datos personales de menores de esa
            edad.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">8. Cambios a esta política</h2>
          <p className="text-sm">
            Esta política puede actualizarse a medida que la Aplicación
            incorpore nuevas funciones (por ejemplo, cuentas de usuario o el
            plan premium). Los cambios relevantes se comunicarán dentro de la
            Aplicación.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">9. Contacto</h2>
          <p className="text-sm">
            Para consultas sobre esta política: example@placeholder.app
          </p>
        </section>

        <p className="text-xs text-muted border-t border-line pt-4">
          Nota: esta Política puede actualizarse a medida que PlainChord
          incorpore nuevas funciones que impliquen manejo de datos (por
          ejemplo, cuentas de usuario). Te recomendamos revisarla de vez en
          cuando.
        </p>
      </article>
    </div>
  );
}
