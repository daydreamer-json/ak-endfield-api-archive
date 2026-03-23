import endminImg from '../../assets/img/endmin_thumbsup_640px.webp';

export default function AboutTab() {
  return (
    <div className='about-content'>
      <h2>About this website</h2>
      <p>
        This site functions as a simplified display page for data from the <strong>ak-endfield-api-archive</strong>{' '}
        repository.
      </p>
      <p>
        The{' '}
        <a href='https://github.com/daydreamer-json/ak-endfield-api-archive' target='_blank' rel='noreferrer'>
          <strong>ak-endfield-api-archive</strong>
        </a>{' '}
        repository automatically records various API data changes for Arknights: Endfield. It also archives not only API
        changes but also some packages and raw binary data. This is useful for certain users interested in analyzing and
        researching game data.
      </p>

      <h3>Disclaimer</h3>
      <p>
        This project has no affiliation with Hypergryph (GRYPHLINE) and was created solely for{' '}
        <strong>private use, educational, and research purposes.</strong>
        <br />
        Copyright for the archived API data and binary data belongs to their respective copyright holders.
      </p>
      <p>
        I assume no responsibility whatsoever. <strong>PLEASE USE IT AT YOUR OWN RISK.</strong>
      </p>

      <h3>Thanks</h3>
      <table className='table table-sm table-borderless w-auto mb-2 bg-transparent'>
        <tbody>
          <tr className='bg-transparent'>
            <td className='fw-bold bg-transparent'>Vivi029</td>
            <td className='bg-transparent'>Added Windows Google Play Games channel</td>
          </tr>
        </tbody>
      </table>

      <img id='endmin-thumbsup' src={endminImg} alt='Endmin Thumbs Up' />
    </div>
  );
}
